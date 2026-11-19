// Choosing a file to upload. The app uses the system's own picker
// (file_picker: the Storage Access Framework on Android, so no storage
// permission is asked for); tests hand the library a fake one through the
// widget tree (a `DocumentPicker` provided above the app).

import 'package:file_picker/file_picker.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

/// A file chosen for upload: its name, its size in bytes (null when the
/// phone couldn't tell) and a way to read it, again for a retry.
class PickedDocument {
  const PickedDocument({required this.name, required this.size, required this.open});

  final String name;
  final int? size;
  final Stream<List<int>> Function() open;
}

abstract class DocumentPicker {
  const DocumentPicker();

  /// The picked file, or null when the person closed the picker.
  /// [onPreparing] is called while a big file is being copied in from its
  /// app (a cloud drive, say), so the screen can say so.
  Future<PickedDocument?> pick({VoidCallback? onPreparing});

  /// The picker provided above the app (tests), else the system's.
  static DocumentPicker of(BuildContext context) =>
      Provider.of<DocumentPicker?>(context, listen: false) ?? const SystemDocumentPicker();
}

class SystemDocumentPicker extends DocumentPicker {
  const SystemDocumentPicker();

  @override
  Future<PickedDocument?> pick({VoidCallback? onPreparing}) async {
    // Any file: the library says plainly which kinds it can read, instead
    // of greying out files whose type a storage app reports oddly (.md and
    // .djvu often arrive as application/octet-stream).
    final file = await FilePicker.pickFile(
      type: FileType.any,
      onFileLoading: (status) {
        if (status == FilePickerStatus.picking) onPreparing?.call();
      },
    );
    if (file == null) return null;
    final size = file.lengthSync() ?? await file.length();
    return PickedDocument(name: file.name, size: size, open: file.readAsByteStream);
  }
}
