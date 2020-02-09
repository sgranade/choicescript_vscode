import { TextDocument, SymbolInformation, SymbolKind } from 'vscode-languageserver';

import { ProjectIndex } from './index';


export function generateSymbols(textDocument: TextDocument, projectIndex: ProjectIndex): SymbolInformation[] {
	// Generate label locations
	let info = Array.from(projectIndex.getLabels(textDocument.uri)).map(([label, location]): SymbolInformation => {
		return {
			name: label,
			kind: SymbolKind.Namespace,
			location: location
		};
	});

	info.push(...projectIndex.getDocumentScopes(textDocument.uri).choiceScopes.map((scope): SymbolInformation => {
		return {
			name: "choice",
			kind: SymbolKind.Function,
			location: {
				range: scope,
				uri: textDocument.uri
			}
		};
	}));

	info.push(...Array.from(projectIndex.getLocalVariables(textDocument.uri)).map(([variable, location]): SymbolInformation => {
		return {
			name: variable,
			kind: SymbolKind.Variable,
			location: location
		};
	}));

	return info;
}