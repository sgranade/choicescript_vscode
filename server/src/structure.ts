import { TextDocument, SymbolInformation, SymbolKind } from 'vscode-languageserver';

import { ProjectIndex } from './index';
import { uriIsStartupFile } from './language';


export function generateSymbols(textDocument: TextDocument, projectIndex: ProjectIndex): SymbolInformation[] {
	// Generate label locations
	let info = Array.from(projectIndex.getLabels(textDocument.uri).values()).map((label): SymbolInformation => {
		if (label.scope !== undefined) {
			return {
				name: label.label,
				kind: SymbolKind.Namespace,
				location:  {
					range: label.scope,
					uri: label.location.uri
				}
			};	
		}
		else {
			return {
				name: label.label,
				kind: SymbolKind.Namespace,
				location: label.location
			};
		}
	});

	info.push(...projectIndex.getDocumentScopes(textDocument.uri).choiceScopes.map((scope): SymbolInformation => {
		return {
			name: `${scope.summary}`,
			kind: SymbolKind.Function,
			location: {
				range: scope.range,
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

	if (uriIsStartupFile(textDocument.uri)) {
		info.push(...Array.from(projectIndex.getGlobalVariables()).map(([variable, location]): SymbolInformation => {
			return {
				name: variable,
				kind: SymbolKind.Variable,
				location: location
			};
		}));
	}

	return info;
}