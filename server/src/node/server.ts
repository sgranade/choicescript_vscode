import {
	createConnection,
	ProposedFeatures,
} from 'vscode-languageserver/node';
import { startServer } from '../common/server';
import { SystemFileProvider } from './system-file-provider';

const connection = createConnection(ProposedFeatures.all);
connection.console.info(`ChoiceScript language server running in node ${process.version}`);

startServer(connection, new SystemFileProvider());
