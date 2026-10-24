export interface GoogleDriveUser {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleDriveSyncResult {
  success: boolean;
  fileId?: string;
  modifiedTime?: string;
  error?: string;
  conflict?: boolean;
  remoteModifiedTime?: string;
}

export interface DriveBackupItem {
  id: string;
  name: string;
  modifiedTime: string;
  size?: number;
}

export interface DriveLiveMetadata {
  folderId: string;
  folderUrl: string;
  fileId?: string;
  modifiedTime?: string;
  size?: number;
}

export interface GoogleDriveStorageQuota {
  limit?: number;
  usage?: number;
  usageInDrive?: number;
}
