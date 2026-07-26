import {
    type Connection,
    Location,
    RequestType,
    type URI,
} from "vscode-languageserver";

import { CustomRequests } from "./constants";

export const SelectionWordCountRequest: RequestType<
    Location,
    number | undefined,
    void
> = new RequestType(CustomRequests.SelectionWordCount);
export const WordCountRequest: RequestType<string, number | undefined, void> =
    new RequestType(CustomRequests.WordCount);

export const FileContentRequest: RequestType<
    { uri: URI; encoding?: string },
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
> = new RequestType(CustomRequests.FileContent);
export const FindFilesRequest: RequestType<
    { pattern: string; rootPath?: URI },
    URI[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
> = new RequestType(CustomRequests.FindFiles);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FileExistsRequest: RequestType<URI, boolean, any> =
    new RequestType(CustomRequests.FileExists);

export class RequestService {
    constructor(private connection: Connection) {}

    public async getFileContents(path: URI): Promise<string> {
        return this.connection.sendRequest(FileContentRequest, { uri: path });
    }

    public async findFiles(pattern: string, rootPath?: URI): Promise<URI[]> {
        return this.connection.sendRequest(FindFilesRequest, {
            pattern,
            rootPath,
        });
    }

    public async fileExists(path: URI): Promise<boolean> {
        return this.connection.sendRequest(path);
    }
}
