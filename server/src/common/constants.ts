export enum CustomMessages {
	AllowUnsafeScript = 'choicescript/allowUnsafeScript',
	CoGStyleGuide = 'choicescript/cogStyleGuide',
	DebugMessage = 'choicescript/debugMessage',
	ProjectIndexed = 'choicescript/projectIndexed',
	UpdatedSceneFilesPath = 'choicescript/sceneFilespath',
	UpdatedImageFilesPath = 'choicescript/imageFilespath',
	UpdatedWordCount = 'choicescript/updatedWordCount',
}

export enum CustomRequests {
	FileContent = 'fs/content',
	FileExists = 'fs/fileExists',
	FindFiles = 'fs/findFiles',
	SelectionWordCount = 'choicescript/selectionWordCount',
	WordCount = 'choicescript/wordCount',
}

export type AllowUnsafeScriptOption = "never" | "warn" | "allow";
