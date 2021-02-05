import {
	DecorationOptions,
	DecorationRangeBehavior,
	Disposable,
	Range,
	TextEditor,
	TextEditorDecorationType,
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

	dispose() {
		this.clearAnnotations(this._editor);
	}

	clear(editor: TextEditor | undefined) {
		if (this._editor !== editor && this._editor != null) {
			this.clearAnnotations(this._editor);
		}
		this.clearAnnotations(editor);
	}

	private clearAnnotations(editor: TextEditor | undefined) {
		if (editor === undefined || (editor as any)._disposed === true) return;

		editor.setDecorations(annotationDecoration, []);
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
	addTrailingAnnotation(editor: TextEditor, line: number, message: string) {
		this.clearAnnotations(this._editor);
		if (editor.document === null) {
			return;
		}
		this._editor = editor;
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
}