import { useContext } from 'react';
import { App } from 'obsidian';
import { AppContext, PluginContext } from './context';

export const useApp = (): App | undefined => {
  return useContext(AppContext);
};

export const usePlugin = () => {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error('usePlugin must be used within a PluginProvider');
  }
  return context;
};