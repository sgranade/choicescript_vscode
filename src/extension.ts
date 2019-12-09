import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const keywordCompletionProvider = vscode.languages.registerCompletionItemProvider(
		'choicescript', 
		{
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
				// Suggest ChoiceScript keywords
				let linePrefix = document.lineAt(position).text.substr(0, position.character);
				let commandRegex = new RegExp('(?<!\\b)\\*$');
				if (commandRegex.test(linePrefix)) {
					return [
						new vscode.CompletionItem('choice', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('fake_choice', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('create', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('temp', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('delete', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('set', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('if', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('elseif', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('else', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('selectable_if', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('disable_reuse', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('hide_reuse', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('allow_reuse', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('label', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('goto', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('goto_scene', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('goto_random_scene', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('gosub', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('gosub_scene', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('redirect_scene', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('finish', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('ending', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('page_break', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('line_break', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('title', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('author', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('input_text', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('input_number', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('rand', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('image', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('link', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('bug', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('stat_chart', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('scene_list', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('achievement', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('achieve', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('check_achievements', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('script', vscode.CompletionItemKind.Keyword),
						new vscode.CompletionItem('comment', vscode.CompletionItemKind.Keyword),
					];
				}
				else {
					return undefined;
				}
			}
		},
		'*'  // trigger on splat
	);

	context.subscriptions.push(keywordCompletionProvider);
}

export function deactivate() {}
