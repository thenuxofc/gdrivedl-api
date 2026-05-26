const CREATOR = "THENUX";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return send(200, { creator: CREATOR, success: true });
    }

    const url = event.queryStringParameters?.url;
    const id = event.queryStringParameters?.id;
    const download = event.queryStringParameters?.download === "true";

    if (!url && !id) {
      return send(400, {
        creator: CREATOR,
        success: false,
        error: "Missing url or id",
      });
    }

    const parsed = id ? { id, type: "file" } : parseDriveUrl(url);

    if (!parsed?.id) {
      return send(400, {
        creator: CREATOR,
        success: false,
        error: "Invalid Google Drive URL",
      });
    }

    if (download && parsed.type === "file") {
      return {
        statusCode: 302,
        headers: {
          "Access-Control-Allow-Origin": "*",
          Location: `https://drive.google.com/uc?export=download&id=${parsed.id}`,
        },
        body: "",
      };
    }

    if (parsed.type === "folder") {
      const data = await listFolder(parsed.id);
      return send(200, data);
    }

    const data = await getFile(parsed.id);
    return send(200, data);
  } catch (err) {
    return send(502, {
      creator: CREATOR,
      success: false,
      error: err.message || "Function crashed",
    });
  }
};

function send(statusCode, body) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(body, null, 2),
  };
}

function parseDriveUrl(input) {
  const text = decodeURIComponent(String(input || "").trim());

  let m = text.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (m) return { type: "folder", id: m[1] };

  m = text.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return { type: "file", id: m[1] };

  m = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return { type: "file", id: m[1] };

  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) {
    return { type: "file", id: text };
  }

  return null;
}

async function listFolder(folderId) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

  if (!apiKey) {
    return {
      creator: CREATOR,
      success: false,
      error: "Missing GOOGLE_DRIVE_API_KEY in Netlify environment variables",
    };
  }

  const apiUrl = new URL("https://www.googleapis.com/drive/v3/files");
  apiUrl.searchParams.set("key", apiKey);
  apiUrl.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
  apiUrl.searchParams.set("pageSize", "1000");
  apiUrl.searchParams.set(
    "fields",
    "files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink)"
  );
  apiUrl.searchParams.set("supportsAllDrives", "true");
  apiUrl.searchParams.set("includeItemsFromAllDrives", "true");

  const res = await fetch(apiUrl.toString());
  const json = await res.json();

  if (!res.ok) {
    return {
      creator: CREATOR,
      success: false,
      error: json?.error?.message || "Google Drive API error",
      raw: json,
    };
  }

  return {
    creator: CREATOR,
    success: true,
    type: "google-drive-folder",
    folder_id: folderId,
    total_files: json.files?.length || 0,
    files: (json.files || []).map(formatFile),
  };
}

async function getFile(fileId) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

  let file = { id: fileId };

  if (apiKey) {
    const apiUrl = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
    apiUrl.searchParams.set("key", apiKey);
    apiUrl.searchParams.set(
      "fields",
      "id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink"
    );
    apiUrl.searchParams.set("supportsAllDrives", "true");

    const res = await fetch(apiUrl.toString());
    const json = await res.json();

    if (res.ok) file = json;
  }

  return {
    creator: CREATOR,
    success: true,
    type: "google-drive-file",
    file: formatFile(file),
  };
}

function formatFile(file) {
  return {
    id: file.id,
    name: file.name || null,
    mimeType: file.mimeType || null,
    size: file.size ? Number(file.size) : null,
    size_formatted: file.size ? humanSize(Number(file.size)) : null,
    thumbnail: file.thumbnailLink || null,
    view_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    download_url: `https://drive.google.com/uc?export=download&id=${file.id}`,
    direct_download_api: `/api/gdrive?id=${file.id}&download=true`,
  };
}

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let i = 0;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
