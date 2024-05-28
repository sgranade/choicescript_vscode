import {
	type DecorationOptions,
	DecorationRangeBehavior,
	type Disposable,
	Range,
	type TextDocumentChangeEvent,
	type TextEditor,
	type TextEditorDecorationType,
	ThemeColor,
	window
} from 'vscode';


const annotationDecoration: TextEditorDecorationType = window.createTextEditorDecorationType({
	after: {
		margin: '0 0 0 3em',
		textDecoration: 'none',
	},
	rangeBehavior: DecorationRangeBehavior.ClosedOpen,
});


export class LineAnnotationController implements Disposable {
	private _editor: TextEditor | undefined;
	private _docUriString: string | undefined;
	private _line: number | undefined;

	dispose(): void {
		this.clearAnnotations();
	}

	/**
	 * Clear annotations on a specific editor.
	 */
	clear(editor: TextEditor): void {
		if (editor == this._editor) {
			this.clearAnnotations();
		}
	}

	/**
	 * Clear all annotations.
	 */
	clearAll(): void {
		this.clearAnnotations();
	}

	/**
	 * Clear annotation on the editor we annotated.
	 */
	private clearAnnotations() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (this._editor === undefined || (this._editor as any)._disposed === true) return;

		this._editor.setDecorations(annotationDecoration, []);
		this._editor = undefined;
		this._docUriString = undefined;
		this._line = undefined;
	}

	/**
	 * Add a single trailing annotation to an editor.
	 * 
	 * Note that this function assumes there will only ever be one active annotation in an editor,
	 * and that annotation is non-persistent.
	 * 
	 * @param editor Editor to add the annotation to.
	 * @param line 0-based line to add the trailing annotation.
	 * @param message Annotation message.
	 */
	addTrailingAnnotation(editor: TextEditor, line: number, message: string): void {
		this.clearAnnotations();
		if (editor.document === null) {
			return;
		}
		this._editor = editor;
		this._docUriString = editor.document.uri.toString();
		this._line = line;
		const decorationRange = editor.document.validateRange(
			new Range(line, Number.MAX_SAFE_INTEGER, line, Number.MAX_SAFE_INTEGER)
		);
		const decorations: DecorationOptions[] = [{
			range: decorationRange,
			renderOptions: {
				after: {
					contentText: message,
					fontStyle: 'italic',
					color: new ThemeColor('errorForeground')
				}
			}
		}];
		editor.setDecorations(annotationDecoration, decorations);
	}

	onTextDocumentChanged(e: TextDocumentChangeEvent): void {
		if (e.document.uri.toString() == this._docUriString) {
			this.clearAll();
		}
	}
}