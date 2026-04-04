import { StorageProvider } from "./storage.interface";
import { GoogleDriveProvider } from "./google-drive.provider";
import { S3Provider } from "./s3.provider";

let instance: StorageProvider;

export function getStorage(): StorageProvider {
  if (!instance) {
    const type = process.env.STORAGE_TYPE?.toUpperCase() || "DRIVE";
    if (type === "S3") {
      instance = new S3Provider();
      console.log("🛠  Storage initialized: S3/MinIO");
    } else {
      instance = new GoogleDriveProvider();
      console.log("🛠  Storage initialized: Google Drive");
    }
  }
  return instance;
}

export default getStorage();
