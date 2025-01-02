import { createContext } from 'react';
import { App } from 'obsidian';
import LegifrancePlugin from 'main';

export const AppContext = createContext<App | undefined>(undefined);

export const PluginContext = createContext<LegifrancePlugin | undefined>(undefined);