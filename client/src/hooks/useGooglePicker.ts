import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

declare global {
  interface Window {
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId?: string) => GoogleDocsView;
        DocsUploadView: new () => GoogleDocsUploadView;
        Feature: {
          SUPPORT_DRIVES: string;
          NAV_HIDDEN: string;
          MULTISELECT_ENABLED: string;
        };
        ViewId: {
          DOCS: string;
          FOLDERS: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
      };
    };
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
  }
}

interface GooglePickerBuilder {
  setDeveloperKey(key: string): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setAppId(appId: string): GooglePickerBuilder;
  addView(view: GoogleDocsView | GoogleDocsUploadView | string): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): GooglePickerBuilder;
  setTitle(title: string): GooglePickerBuilder;
  setOrigin(origin: string): GooglePickerBuilder;
  build(): GooglePicker;
}

interface GoogleDocsView {
  setIncludeFolders(include: boolean): GoogleDocsView;
  setEnableDrives(enable: boolean): GoogleDocsView;
  setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
  setMimeTypes(mimeTypes: string): GoogleDocsView;
  setParent(folderId: string): GoogleDocsView;
}

interface GoogleDocsUploadView {
  setIncludeFolders(include: boolean): GoogleDocsUploadView;
  setParent(folderId: string): GoogleDocsUploadView;
}

interface GooglePicker {
  setVisible(visible: boolean): void;
}

export interface PickerDocument {
  id: string;
  name: string;
  mimeType: string;
  type: string;
  isShared: boolean;
  teamDriveId?: string;
  url?: string;
  iconUrl?: string;
  parentId?: string;
  serviceId?: string;
  uploadState?: string;
}

interface PickerCallbackData {
  action: string;
  docs?: PickerDocument[];
}

interface UseGooglePickerResult {
  openPicker: () => Promise<void>;
  isLoading: boolean;
  isPickerReady: boolean;
  error: string | null;
}

interface PickerOptions {
  onDriveSelected?: (driveId: string, driveName: string) => void;
  onFolderSelected?: (folderId: string, folderName: string) => void;
  onFileSelected?: (file: PickerDocument) => void;
  onFileUploaded?: (file: PickerDocument) => void;
  mode?: 'shared-drives' | 'folders' | 'files' | 'upload';
  title?: string;
  parentFolderId?: string;
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function waitForGapi(timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (window.gapi) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for Google API to load'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }
    if (!window.gapi) {
      reject(new Error('Google API not loaded'));
      return;
    }
    window.gapi.load('picker', () => {
      if (window.google?.picker) {
        resolve();
      } else {
        reject(new Error('Failed to load Picker API'));
      }
    });
  });
}

export function useGooglePicker(options: PickerOptions = {}): UseGooglePickerResult {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isPickerReady, setIsPickerReady] = useState(!!window.google?.picker);
  const [error, setError] = useState<string | null>(null);

  const openPicker = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loadScript('https://apis.google.com/js/api.js', 'google-api-script');
      await waitForGapi();
      await loadPickerApi();
      setIsPickerReady(true);

      const response = await apiRequest('GET', '/api/google-workspace/picker-token');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get access token');
      }

      const data = await response.json();
      const { accessToken, apiKey, appId } = data;

      if (!accessToken) {
        throw new Error('No access token available. Please reconnect Google Workspace.');
      }

      if (!apiKey) {
        throw new Error('Google Picker API key not configured. Please contact your administrator.');
      }

      const google = window.google!;
      const mode = options.mode || 'shared-drives';
      
      let title: string;
      const pickerBuilder = new google.picker.PickerBuilder()
        .setDeveloperKey(apiKey)
        .setOAuthToken(accessToken)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setOrigin(window.location.protocol + '//' + window.location.host);

      if (appId) {
        pickerBuilder.setAppId(appId);
      }

      if (mode === 'upload') {
        const uploadView = new google.picker.DocsUploadView()
          .setIncludeFolders(true);
        
        if (options.parentFolderId) {
          uploadView.setParent(options.parentFolderId);
        }

        const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setEnableDrives(true)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);

        pickerBuilder.addView(uploadView);
        pickerBuilder.addView(docsView);
        title = options.title || 'Upload or Select a File';
      } else if (mode === 'files') {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setEnableDrives(true)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);
        pickerBuilder.addView(view);
        title = options.title || 'Select a File from Google Drive';
      } else {
        const view = new google.picker.DocsView()
          .setEnableDrives(true)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true);
        pickerBuilder.addView(view);
        title = options.title || 'Select a Shared Drive';
      }

      pickerBuilder
        .setTitle(title)
        .setCallback((callbackData: PickerCallbackData) => {
          if (callbackData.action === google.picker.Action.PICKED) {
            const doc = callbackData.docs?.[0];
            if (doc) {
              if (mode === 'upload') {
                if (options.onFileUploaded) {
                  options.onFileUploaded(doc);
                } else if (options.onFileSelected) {
                  options.onFileSelected(doc);
                }
              } else if (mode === 'files' && options.onFileSelected) {
                options.onFileSelected(doc);
              } else if (doc.teamDriveId && options.onDriveSelected) {
                options.onDriveSelected(doc.teamDriveId, doc.name);
              } else if (doc.id && options.onFolderSelected) {
                options.onFolderSelected(doc.id, doc.name);
              } else if (doc.id && options.onDriveSelected) {
                options.onDriveSelected(doc.id, doc.name);
              }
            }
          }
        });

      const picker = pickerBuilder.build();
      picker.setVisible(true);
    } catch (err: any) {
      console.error('Picker error:', err);
      const errorMessage = err.message || 'Failed to open Google Picker';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [options, toast]);

  return {
    openPicker,
    isLoading,
    isPickerReady,
    error,
  };
}
