import * as vscode from 'vscode';
import type { BaseLanguageClient, GenericNotificationHandler } from 'vscode-languageclient';

let client: BaseLanguageClient;
const notificationManagers: Map<string, ListenerManager> = new Map();

/**
 * Class that keeps track of whether or not it's been disposed.
 */
class DisposeWithFlag {
	disposed = false;
	dispose() {
		this.disposed = true;
	}
}

/**
 * Class to make a GenericNotificationHandler disposable.
 */
class ListenerWrapper extends DisposeWithFlag {
	handler: GenericNotificationHandler;
	constructor(handler: GenericNotificationHandler) {
		super();
		this.handler = handler;
	}
}

/**
 * Manager for multiple notification listeners.
 */
class ListenerManager extends DisposeWithFlag {
	listenMethods: ListenerWrapper[] = [];
	disposable?: vscode.Disposable;

	handleNotification(manager: ListenerManager, ...params) {
		manager.listenMethods = manager.listenMethods.filter(v => !v.disposed);
		for (const listenMethod of manager.listenMethods) {
			listenMethod.handler(...params);
		}
	}

	dispose() {
		super.dispose();
		this.disposable?.dispose();
	}
}

/**
 * Initialize notification listener management.
 * @param newClient Client for notifications.
 * @returns Disposable encapsulating all listeners.
 */
export function initNotifications(newClient: BaseLanguageClient): vscode.Disposable {
	if (client !== undefined) {
		throw 'Tried to double-initialize notifications';
	}
	client = newClient;
	return vscode.Disposable.from({
		dispose: function() {
			for (const manager of notificationManagers.values()) {
				manager.dispose();
			}
		}
	});
}

/**
 * Add a function to handle a given notification.
 * @param method Notification method to listen for.
 * @param handler Function to handle the notification.
 * @returns Disposable that, if disposed, stops the listener. It does not have to be disposed, though.
 */
export function addNotificationHandler(method: string, handler: GenericNotificationHandler): vscode.Disposable {
	if (client === undefined) {
		throw 'Notifications not initialized before being added to';
	}

	const wrapper = new ListenerWrapper(handler);
	let manager = notificationManagers.get(method);
	if (manager === undefined) {
		manager = new ListenerManager();
		const disposable = client.onNotification(method, (...params) => {
			manager?.handleNotification(manager, params);
		});
		manager.disposable = disposable;
		notificationManagers.set(method, manager);
	}
	manager.listenMethods.push(wrapper);
	return vscode.Disposable.from(wrapper);
}