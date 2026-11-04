import { isAxiosError } from 'axios';
import { apiClient } from '@/services/axios';

/**
 * GETs a file and saves it through the browser's download, named after the response's
 * Content-Disposition (or `fallbackName`). An error body comes back as a Blob with
 * `responseType: 'blob'`: it is parsed back into JSON so getApiErrorMessage reads the BE message.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  try {
    const res = await apiClient.get<Blob>(url, { responseType: 'blob' });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
    const name = encoded ? decodeURIComponent(encoded) : (plain ?? fallbackName);
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
    // Revoked a tick later: some browsers start the download after click() returns.
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  } catch (err) {
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text());
      } catch {
        // Not JSON: keep the axios message.
      }
    }
    throw err;
  }
}
