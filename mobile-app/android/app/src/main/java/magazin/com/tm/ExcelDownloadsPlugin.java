package magazin.com.tm;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "ExcelDownloads")
public class ExcelDownloadsPlugin extends Plugin {

    private static final String TAG = "ExcelDownloads";

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        String mimeType = call.getString("mimeType");

        if (fileName == null || fileName.isEmpty()) {
            call.reject("fileName is required");
            return;
        }
        if (base64 == null || base64.isEmpty()) {
            call.reject("base64 is required");
            return;
        }
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = "application/vnd.ms-excel";
        }

        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();

            Uri collection;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            } else {
                collection = MediaStore.Files.getContentUri("external");
            }

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            } else {
                // Older devices: file will still appear under "Downloads" in most file managers
                String downloadsPath = Environment
                        .getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                        .getAbsolutePath();
                values.put(MediaStore.MediaColumns.DATA, downloadsPath + "/" + fileName);
            }

            Uri itemUri = resolver.insert(collection, values);
            if (itemUri == null) {
                call.reject("Failed to create download entry via MediaStore");
                return;
            }

            OutputStream out = null;
            try {
                out = resolver.openOutputStream(itemUri, "w");
                if (out == null) {
                    call.reject("Failed to open output stream for Downloads");
                    return;
                }
                out.write(data);
                out.flush();
            } catch (IOException e) {
                Log.e(TAG, "Error writing file to Downloads", e);
                call.reject("Error writing file: " + e.getMessage(), e);
                return;
            } finally {
                if (out != null) {
                    try {
                        out.close();
                    } catch (IOException e) {
                        // ignore
                    }
                }
            }

            Log.i(TAG, "Excel file saved to Downloads: " + fileName + " -> " + itemUri.toString());

            JSObject ret = new JSObject();
            ret.put("uri", itemUri.toString());
            ret.put("fileName", fileName);
            ret.put("mimeType", mimeType);
            call.resolve(ret);

        } catch (IllegalArgumentException e) {
            Log.e(TAG, "Base64 decode error", e);
            call.reject("Failed to decode base64: " + e.getMessage(), e);
        } catch (Exception e) {
            Log.e(TAG, "Unknown error in saveToDownloads", e);
            call.reject("Unknown error: " + e.getMessage(), e);
        }
    }
}
