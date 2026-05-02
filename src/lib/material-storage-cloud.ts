import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { isFirebaseReady, storage } from "./firebase";
import type { MaterialAttachment } from "./learning-materials";

export class MaterialUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialUploadError";
  }
}

function canUseCloudStorage() {
  return Boolean(isFirebaseReady && storage);
}

function dataUrlToBlob(dataUrl: string) {
  return fetch(dataUrl).then((res) => res.blob());
}

function sanitizeName(name: string) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function uploadMaterialAttachmentIfNeeded(
  ownerTeacherEmail: string,
  materialId: string,
  attachment: MaterialAttachment
) {
  if (!attachment?.dataUrl) return attachment;
  if (!attachment.dataUrl.startsWith("data:")) return attachment;
  if (!canUseCloudStorage()) {
    throw new MaterialUploadError(
      "Hệ thống lưu trữ chưa sẵn sàng trên production. Vui lòng kiểm tra NEXT_PUBLIC_FIREBASE_*."
    );
  }

  try {
    const blob = await dataUrlToBlob(attachment.dataUrl);
    const filename = sanitizeName(attachment.name);
    const key = `materials/${ownerTeacherEmail}/${materialId}/${Date.now()}-${filename}`;
    const storageRef = ref(storage!, key);
    await uploadBytes(storageRef, blob, {
      contentType: attachment.type || blob.type || "application/octet-stream"
    });
    const url = await getDownloadURL(storageRef);
    return {
      ...attachment,
      dataUrl: url,
      size: Number(attachment.size) || blob.size
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unauthorized") || message.includes("permission")) {
      throw new MaterialUploadError(
        "Không có quyền upload lên Firebase Storage. Vui lòng kiểm tra Storage Rules."
      );
    }
    throw new MaterialUploadError(
      "Upload file thất bại trên cloud storage. Vui lòng kiểm tra cấu hình Firebase của production."
    );
  }
}

export async function uploadMaterialAttachmentsIfNeeded(
  ownerTeacherEmail: string,
  materialId: string,
  attachments: MaterialAttachment[]
) {
  const results: MaterialAttachment[] = [];
  for (const item of attachments || []) {
    results.push(await uploadMaterialAttachmentIfNeeded(ownerTeacherEmail, materialId, item));
  }
  return results;
}
