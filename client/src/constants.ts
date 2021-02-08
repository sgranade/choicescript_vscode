import path = require('path');

export enum CustomCommands {
	Bold = 'choicescript.bold',
	CancelTest = 'choicescript.cancelTest',
	GameOpened = 'choicescript.gameOpened',
	Italicize = 'choicescript.italicize',
	OpenGame = 'choicescript.openGame',
	ProjectLoaded = 'choicescript.projectLoaded',
	ReloadGame = 'choicescript.reloadGame',
	RunQuicktest = 'choicescript.runQuicktest',
	TestRunning = 'choicescript.testRunning'
}

export enum CustomMessages {
	SelectionWordCountRequest = 'choicescript/selectionwordcount',
	UpdatedProjectFiles = 'choicescript/projectfiles',
	UpdatedWordCount = 'choicescript/updatedwordcount',
	WordCountRequest = 'choicescript/wordcount',
}

// Paths relative to the extension
export const RelativePaths = {
	Autotest: path.join('client', 'src', 'autotest.js'),
	Choicescript: path.join('client', 'node_modules', 'cside-choicescript'),
	GameIndex: path.join('client', 'src', 'cs-index.html'),
	CSExtension: path.join('client', 'src', 'cs-extension.js'),
	VSCodeExtensionServer: path.join('server', 'out', 'server.js')
}

export enum CSUrls {
	GameIndex = '/web/mygame/index.html'
}