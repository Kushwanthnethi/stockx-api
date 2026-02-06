
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export class FileDownloader {
    static async downloadFile(fileUrl: string, outputLocation: string): Promise<string> {
        const writer = fs.createWriteStream(outputLocation);

        return new Promise((resolve, reject) => {
            axios({
                method: 'get',
                url: fileUrl,
                responseType: 'stream',
                headers: {
                    // Emulate a browser to avoid some basic 403s
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }).then(response => {
                response.data.pipe(writer);
                writer.on('finish', () => {
                    writer.close();
                    resolve(outputLocation);
                });
                writer.on('error', (err) => {
                    fs.unlink(outputLocation, () => { }); // Delete failed file
                    reject(err);
                });
            }).catch((err) => {
                reject(new Error(`Download failed: ${err.message}`));
            });
        });
    }
}
