/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createConnection, BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver/browser';
import { startServer } from '../common/server';
import { RequestFileProvider } from './request-file-provider';
import { RequestService } from '../common/request-service';

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);
connection.console.info('ChoiceScript language server running in a Web Worker');

startServer(connection, new RequestFileProvider(new RequestService(connection)));
