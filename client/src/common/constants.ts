import { join as joinPath } from "path";

export enum RandomtestPutResultsInDocumentOptions {
    Never = "never",
    Always = "always",
    Fulltext = "fulltext",
}

export enum Configuration {
    BaseSection = "choicescript",
    UseCOGStyleGuide = "useChoiceOfGamesStyleGuide",
    DisableQuickSuggestions = "disableQuickSuggestions",
    AllowUnsafeScript = "allowUnsafeScript",
    RandomtestIterations = "randomtest.iterations",
    RandomtestSeed = "randomtest.randomSeed",
    RandomtestPutResultsInDocument = "randomtest.putResultsInDocument",
    RandomtestPutResultsInUniqueDocument = "randomtest.putResultsInUniqueDocument",
    RandomtestAvoidUsedOptions = "randomtest.avoidUsedOptions",
    RandomtestShowChoices = "randomtest.showChoices",
    RandomtestShowFullText = "randomtest.showFullText",
    RandomtestShowLineCoverageStatistics = "randomtest.showLineCoverageStatistics",
}

export enum CustomCommands {
    Bold = "choicescript.bold",
    CancelTest = "choicescript.cancelTest",
    Italicize = "choicescript.italicize",
    RunGame = "choicescript.runGame",
    RunQuicktest = "choicescript.runQuicktest",
    RunRandomtestDefault = "choicescript.runRandomtestDefault",
    RunRandomtestInteractive = "choicescript.runRandomtestInteractive",
    RerunRandomTest = "choicescript.rerunRandomtest",
}

export enum CustomContext {
    GameOpened = "choicescript.gameOpened",
    ProjectLoaded = "choicescript.projectLoaded",
    PreviousRandomtestSettingsExist = "choicescript.previousRandomtestSettingsExist",
    TestRunning = "choicescript.testRunning",
}

export enum CustomMessages {
    AllowUnsafeScript = "choicescript/allowUnsafeScript",
    CoGStyleGuide = "choicescript/cogStyleGuide",
    DebugMessage = "choicescript/debugMessage",
    ProjectIndexed = "choicescript/projectIndexed",
    UpdatedSceneFilesPath = "choicescript/sceneFilespath",
    UpdatedImageFilesPath = "choicescript/imageFilespath",
    UpdatedWordCount = "choicescript/updatedWordCount",
}

export enum CustomRequests {
    FileContent = "fs/content",
    FileExists = "fs/fileExists",
    FindFiles = "fs/findFiles",
    SelectionWordCount = "choicescript/selectionWordCount",
    WordCount = "choicescript/wordCount",
}

export enum LocalWorkspaceStorageKeys {
    PreviousRandomtestSettings = "randomtest.previousSettings",
}

export enum RandomtestSettingsSource {
    VSCodeConfiguration,
    LastTestRun,
    Interactive,
}

export type AllowUnsafeScriptOption = "never" | "warn" | "allow";

// Paths relative to the extension
export const RelativePaths = {
    Choicescript: joinPath("choicescript", "out"),
    GameIndex: joinPath("choicescript", "out", "index.html"),
    Quicktest: joinPath("choicescript", "out", "autotest.js"),
    Randomtest: joinPath("choicescript", "out", "randomtest.js"),
    VSCodeExtensionServer: joinPath("server", "dist/node", "server.js"),
};
