import { ServerConnection } from './connection.js';
import { BobbleRenderer } from './renderer.js';
import { SessionController } from './session-controller.js';

const connection = new ServerConnection();
const renderer = new BobbleRenderer();
const controller = new SessionController(connection, renderer);

controller.start();
