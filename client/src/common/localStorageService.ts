import type { Memento } from "vscode";

/**
 * Manage data stored locally in a Memento object.
 */
export class LocalStorageService {
    constructor(private storage: Memento) {}

    public getValue<T>(key: string): T | undefined {
        return this.storage.get<T>(key);
    }

    public setValue<T>(key: string, value: T): void {
        this.storage.update(key, value);
    }
}

let _workspaceStorageService: LocalStorageService,
    _globalStorageService: LocalStorageService;

/**
 * Set up storage managers for the workspace and global states.
 *
 * @param workspaceState Memento for workspace state.
 * @param globalState Memento for the global state.
 */
export function setupLocalStorages(
    workspaceState: Memento,
    globalState: Memento,
): void {
    _workspaceStorageService = new LocalStorageService(workspaceState);
    _globalStorageService = new LocalStorageService(globalState);
}

/**
 * Get the workspace storage service.
 */
export function getWorkspaceStorageService(): LocalStorageService | undefined {
    return _workspaceStorageService;
}

/**
 * Get the global storage service.
 */
export function getGlobalStorageService(): LocalStorageService | undefined {
    return _globalStorageService;
}
