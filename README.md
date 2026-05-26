# THENUX Google Drive Download API ⚡

A public Google Drive file/folder download API built for Netlify Functions.

## Endpoints

```txt
/api/gdrive?url=GOOGLE_DRIVE_LINK
/api/drive?url=GOOGLE_DRIVE_LINK
```

## Example

```txt
https://your-site.netlify.app/api/gdrive?url=https://drive.google.com/drive/folders/1z01SpYtkeVrcUeRUexo2smNmR8koub-J
```

## Supported Links

- Google Drive folder links
- Google Drive file links
- `open?id=FILE_ID`
- `uc?id=FILE_ID`

## Environment Variable

Add this in Netlify:

```txt
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key
```

Folder listing needs this key.

## Deploy

```bash
npm install
npx netlify login
npx netlify deploy --prod
```

Creator: **THENUX**
