/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, EditorModel, ITextEditorModel } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { marked } from 'vs/base/common/marked/marked';
import { WALK_THROUGH_SNIPPET_SCHEME } from 'vs/workbench/parts/walkThrough/node/walkThroughContentProvider';

export class WalkThroughModel extends EditorModel {

	constructor(
		private mainRef: IReference<ITextEditorModel>,
		private snippetRefs: IReference<ITextEditorModel>[]
	) {
		super();
	}

	get main() {
		return this.mainRef.object;
	}

	get snippets() {
		return this.snippetRefs.map(snippet => snippet.object);
	}

	dispose() {
		this.snippetRefs.forEach(ref => ref.dispose());
		this.mainRef.dispose();
		super.dispose();
	}
}

export class WalkThroughInput extends EditorInput {

	static ID: string = 'workbench.editors.walkThroughInput';

	private promise: TPromise<WalkThroughModel>;

	constructor(
		private name: string,
		private description: string,
		private resource: URI,
		private telemetryFrom: string,
		public readonly onReady: (container: HTMLElement) => void,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
	) {
		super();
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return WalkThroughInput.ID;
	}

	getName(): string {
		return this.name;
	}

	getDescription(): string {
		return this.description;
	}

	getTelemetryFrom(): string {
		return this.telemetryFrom || 'walkThrough';
	}

	getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.resource);
		return descriptor;
	}

	resolve(refresh?: boolean): TPromise<WalkThroughModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.resource)
				.then(ref => {
					if (strings.endsWith(this.getResource().path, '.html')) {
						return new WalkThroughModel(ref, []);
					}

					const snippets: TPromise<IReference<ITextEditorModel>>[] = [];
					let i = 0;
					const renderer = new marked.Renderer();
					renderer.code = (code, lang) => {
						const resource = this.resource.with({ scheme: WALK_THROUGH_SNIPPET_SCHEME, fragment: `${i++}.${lang}` });
						snippets.push(this.textModelResolverService.createModelReference(resource));
						return '';
					};

					const markdown = ref.object.textEditorModel.getLinesContent().join('\n');
					marked(markdown, { renderer });

					return TPromise.join(snippets)
						.then(refs => new WalkThroughModel(ref, refs));
				});
		}

		return this.promise;

		// TODO: replicate above?
		// return this.promise.then(ref => {
		// 	const model = ref.object;

		// 	if (!(model instanceof ResourceEditorModel)) {
		// 		ref.dispose();
		// 		this.promise = null;
		// 		return TPromise.wrapError(`Unexpected model for ResourceInput: ${this.resource}`); // TODO@Ben eventually also files should be supported, but we guard due to the dangerous dispose of the model in dispose()
		// 	}

		// 	// TODO@Joao this should never happen
		// 	model.onDispose(() => this.dispose());

		// 	return model;
		// });
	}

	matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof WalkThroughInput) {
			let otherResourceEditorInput = <WalkThroughInput>otherInput;

			// Compare by properties
			return otherResourceEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	dispose(): void {
		if (this.promise) {
			this.promise.then(model => model.dispose());
			this.promise = null;
		}

		super.dispose();
	}
}
