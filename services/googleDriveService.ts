
import { RuleFile } from "../types";

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const DATA_FILENAME = "rule_navigator_sync_data.json";

declare const gapi: any;
declare const google: any;

export class GoogleDriveService {
  private tokenClient: any = null;
  private accessToken: string | null = null;

  async init(clientId: string, apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey: apiKey,
            discoveryDocs: DISCOVERY_DOCS,
          });

          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: (resp: any) => {
              if (resp.error !== undefined) {
                reject(resp);
              }
              this.accessToken = resp.access_token;
              resolve();
            },
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) return reject("Client not initialized");
      
      this.tokenClient.callback = (resp: any) => {
        if (resp.error) return reject(resp.error);
        this.accessToken = resp.access_token;
        resolve(resp.access_token);
      };

      if (gapi.client.getToken() === null) {
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        this.tokenClient.requestAccessToken({ prompt: '' });
      }
    });
  }

  async saveFiles(files: RuleFile[]): Promise<void> {
    if (!this.accessToken) throw new Error("Not connected to Google Drive");

    const existingFileId = await this.findDataFile();
    const metadata = {
      name: DATA_FILENAME,
      mimeType: 'application/json',
    };
    const content = JSON.stringify(files);
    
    const boundary = 'foo_bar_baz';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content +
      close_delim;

    const path = existingFileId 
      ? `/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : '/upload/drive/v3/files?uploadType=multipart';
    
    const method = existingFileId ? 'PATCH' : 'POST';

    await gapi.client.request({
      path: path,
      method: method,
      params: { uploadType: 'multipart' },
      headers: {
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body: multipartRequestBody,
    });
  }

  async loadFiles(): Promise<RuleFile[]> {
    if (!this.accessToken) throw new Error("Not connected to Google Drive");

    const fileId = await this.findDataFile();
    if (!fileId) return [];

    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });

    return response.result;
  }

  private async findDataFile(): Promise<string | null> {
    const response = await gapi.client.drive.files.list({
      q: `name = '${DATA_FILENAME}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = response.result.files;
    return files && files.length > 0 ? files[0].id : null;
  }
}

export const googleDriveService = new GoogleDriveService();
