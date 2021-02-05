import path = require('path');

export enum CustomCommands {
	Bold = 'choicescript.bold',
	GameOpened = 'choicescript.gameOpened',
	Italicize = 'choicescript.italicize',
	OpenGame = 'choicescript.openGame',
	ProjectLoaded = 'choicescript.projectLoaded',
	ReloadGame = 'choicescript.reloadGame'
}

export enum CustomMessages {
	SelectionWordCountRequest = 'choicescript/selectionwordcount',
	UpdatedProjectFiles = 'choicescript/projectfiles',
	UpdatedWordCount = 'choicescript/updatedwordcount',
	WordCountRequest = 'choicescript/wordcount',
}

export const RelativePaths = {
	Choicescript: path.join('client', 'node_modules', 'cside-choicescript'),
	GameIndex: path.join('client', 'src', 'cs-index.html'),
	CSExtension: path.join('client', 'src', 'cs-extension.js'),
	VSCodeExtensionServer: path.join('server', 'out', 'server.js')
}

export enum CSUrls {
	GameIndex = '/web/mygame/index.html'
}