import path = require('path');

export enum RandomtestPutResultsInDocumentOptions {
	Never = 'never',
	Always = 'always',
	Fulltext = 'fulltext'
}

export enum Configuration {
	BaseSection = 'choicescript',
	UseCOGStyleGuide = 'useChoiceOfGamesStyleGuide',
	RandomtestIterations = 'randomtest.iterations',
	RandomtestSeed = 'randomtest.randomSeed',
	RandomtestPutResultsInDocument = 'randomtest.putResultsInDocument',
	RandomtestPutResultsInUniqueDocument = 'randomtest.putResultsInUniqueDocument',
	RandomtestAvoidUsedOptions = 'randomtest.avoidUsedOptions',
	RandomtestShowChoices = 'randomtest.showChoices',
	RandomtestShowFullText = 'randomtest.showFullText',
	RandomtestShowLineCoverageStatistics = 'randomtest.showLineCoverageStatistics'
}

export enum CustomCommands {
	Bold = 'choicescript.bold',
	CancelTest = 'choicescript.cancelTest',
	Italicize = 'choicescript.italicize',
	OpenGame = 'choicescript.openGame',
	RunQuicktest = 'choicescript.runQuicktest',
	RunRandomtestDefault = 'choicescript.runRandomtestDefault',
	RunRandomtestInteractive = 'choicescript.runRandomtestInteractive',
	RerunRandomTest = 'choicescript.rerunRandomtest'
}

export enum CustomContext {
	GameOpened = 'choicescript.gameOpened',
	ProjectLoaded = 'choicescript.projectLoaded',
	PreviousRandomtestSettingsExist = 'choicescript.previousRandomtestSettingsExist',
	TestRunning = 'choicescript.testRunning'
}

export enum CustomMessages {
	CoGStyleGuide = 'choicescript/cogstyleguide',
	SelectionWordCountRequest = 'choicescript/selectionwordcount',
	UpdatedProjectFiles = 'choicescript/projectfiles',
	UpdatedWordCount = 'choicescript/updatedwordcount',
	WordCountRequest = 'choicescript/wordcount',
}

export enum LocalWorkspaceStorageKeys {
	PreviousRandomtestSettings = 'randomtest.previousSettings'
}

export enum RandomtestSettingsSource {
	VSCodeConfiguration,
	LastTestRun,
	Interactive
}

// Paths relative to the extension
export const RelativePaths = {
	Choicescript: path.join('choicescript', 'out'),
	GameIndex: path.join('choicescript', 'out', 'index.html'),
	Quicktest: path.join('choicescript', 'out', 'autotest.js'),
	Randomtest: path.join('choicescript', 'out', 'randomtest.js'),
	VSCodeExtensionServer: path.join('server', 'out', 'server.js')
};
