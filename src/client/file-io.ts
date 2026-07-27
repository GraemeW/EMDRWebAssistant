interface FileSystemFileHandleLike { createWritable(): Promise<FileSystemWritableFileStream>; }

interface FileSystemWritableFileStream {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;

function getShowSaveFilePicker(): ShowSaveFilePicker | undefined { return (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker; }

// Export Functions
let fileInput: HTMLInputElement | null = null;

export async function saveTextFile(suggestedName: string, contents: string, mimeType: string): Promise<void> {
  const showSaveFilePicker = getShowSaveFilePicker();

  if (showSaveFilePicker) {
    let handle: FileSystemFileHandleLike;
    try {
      handle = await showSaveFilePicker({
        suggestedName,
        types: [{ description: 'JSON file', accept: { [mimeType]: ['.json'] } }],
      });
    } catch (err) {
      // The user cancelling the dialog is not an error
      if (err instanceof DOMException && err.name === 'AbortError') { return; }
      throw err;
    }
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return;
  }

  // Fallback: trigger a standard browser download.
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a moment to actually start before revoking
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openTextFile(accept: string, onLoad: (text: string) => void): void {
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  fileInput.accept = accept;
  fileInput.value = ''; // allows re-selecting the same file twice in a row
  fileInput.onchange = () => {
    const file = fileInput?.files?.[0];
    if (!file) return;
    void file.text().then(onLoad);
  };
  fileInput.click();
}
