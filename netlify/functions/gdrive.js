const CREATOR = "THENUX";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(200, { creator: CREATOR, success: true });
  }

  try {
    const url = event.queryStringParameters?.url || event.queryStringParameters?.q;
    const idParam = event.queryStringParameters?.id;
    const rawDownload = event.queryStringParameters?.download === "true";

    if (!url && !idParam) {
      return response(400, {
        creator: CREATOR,
        success: false,
        error: "Missing url or id parameter",
        example: "/api/gdrive?url=https://drive.google.com/drive/folders/FOLDER_ID"
      });
    }

    const parsed = idParam
      ? { id: idParam, type: event.queryStringParameters?.type || "file" }
      : parseDriveUrl(url);

    if (!parsed?.id) {
      return response(400, {
        creator: CREATOR,
        success: false,
        error: "Invalid Google Drive link or ID"
      });
    }

    if (parsed.type === "folder") {
      return await handleFolder(parsed.id);
    }

    const fileResult = await handleFile(parsed.id);

    // Optional redirect mode:
    // /api/gdrive?id=FILE_ID&download=true
    if (rawDownload && fileResult?.download_url) {
      return {
        statusCode: 302,
        headers: {
          "Access-Control-Allow-Origin": "*",
          Location: fileResult.download_url
        },
        body: ""
      };
    }

    return response(200, fileResult);
  } catch (err) {
    return response(500, {
      creator: CREATOR,
      success: false,
      error: err.message || "Server error"
    });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body, null, 2)
  };
}

function parseDriveUrl(input) {
  try {
    const text = decodeURIComponent(String(input).trim());

    let match;

    // Folder: /drive/folders/FOLDER_ID
    match = text.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
    if (match) return { type: "folder", id: match[1] };

    // File: /file/d/FILE_ID
    match = text.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return { type: "file", id: match[1] };

    // id=FILE_ID
    match = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return { type: "file", id: match[1] };

    // Raw ID fallback
    match = text.match(/^([a-zA-Z0-9_-]{20,})$/);
    if (match) return { type: "file", id: match[1] };

    return null;
  } catch {
    return null;
  }
}

async function handleFolder(folderId) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

  if (!apiKey) {
    return responseObject(false, {
      type: "google-drive-folder",
      folder_id: folderId,
      error: "Missing GOOGLE_DRIVE_API_KEY. Add it in Netlify environment variables.",
      help: "Direct file links can work without API key, but folder listing needs Google Drive API key."
    });
  }

  const fields = "files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink),nextPageToken";
  const q = `'${folderId}' in parents and trashed = false`;

  let pageToken = "";
  let files = [];

  do {
    const apiUrl = new URL("https://www.googleapis.com/drive/v3/files");
    apiUrl.searchParams.set("key", apiKey);
    apiUrl.searchParams.set("q", q);
    apiUrl.searchParams.set("fields", fields);
    apiUrl.searchParams.set("pageSize", "1000");
    apiUrl.searchParams.set("supportsAllDrives", "true");
    apiUrl.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) apiUrl.searchParams.set("pageToken", pageToken);

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!res.ok) {
      return responseObject(false, {
        type: "google-drive-folder",
        folder_id: folderId,
        error: data?.error?.message || "Google Drive API error",
        raw: data
      });
    }

    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return responseObject(true, {
    type: "google-drive-folder",
    folder_id: folderId,
    total_files: files.length,
    files: files.map(formatDriveFile)
  });
}

async function handleFile(fileId) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

  let metadata = null;

  if (apiKey) {
    const fields = "id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink";
    const apiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?key=${encodeURIComponent(apiKey)}&fields=${encodeURIComponent(fields)}&supportsAllDrives=true`;

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (res.ok) {
      metadata = data;
    }
  }

  const file = metadata || { id: fileId };

  return responseObject(true, {
    type: "google-drive-file",
    file_id: fileId,
    file: formatDriveFile(file)
  });
}

function formatDriveFile(file) {
  const id = file.id;

  return {
    id,
    name: file.name || null,
    mimeType: file.mimeType || null,
    size: file.size ? Number(file.size) : null,
    size_formatted: file.size ? humanSize(Number(file.size)) : null,
    createdTime: file.createdTime || null,
    modifiedTime: file.modifiedTime || null,
    thumbnail: file.thumbnailLink || null,
    view_url: file.webViewLink || `https://drive.google.com/file/d/${id}/view`,
    download_url: `https://drive.google.com/uc?export=download&id=${id}`,
    direct_download_api: `/api/gdrive?id=${id}&download=true`
  };
}

function responseObject(success, data) {
  return {
    creator: CREATOR,
    success,
    ...data
  };
}

function humanSize(bytes) {
  if (!bytes || bytes < 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
