import Archiver from 'archiver';
import fs, {PathLike} from 'fs';
import path from 'path';
import rimraf from 'rimraf';

interface IArchiverCompression {
    type: string;
    filePath: string;
}

export default class {
    static clearBuildDirectory(directoryPath: string) {
        return new Promise((resolve, reject) => {
            rimraf(directoryPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    static compress(files: IArchiverCompression[], destFilePath: PathLike) {
        return new Promise((resolve, reject) => {
            const fsWriteStream = fs.createWriteStream(destFilePath);
            const archiver = Archiver('zip', {
                zlib: {level: 9}
            });

            fsWriteStream.on('error', reject);
            archiver.on('error', reject);
            fsWriteStream.on('finish', resolve);

            archiver.pipe(fsWriteStream);
            files.forEach((file) => {
                const {type, filePath} = file;
                switch (type) {
                    case 'file':
                        archiver.file(filePath, {name: path.basename(filePath)});
                        break;
                    case 'directory':
                        archiver.directory(filePath, false);
                        break;
                }
            });
            archiver.finalize();
        });
    }
}
