var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/constants.ts
var MAX_SIZE = Math.pow(2, 32);
var TKHD_FLAG_ENABLED = 1;
var TKHD_FLAG_IN_MOVIE = 2;
var TKHD_FLAG_IN_PREVIEW = 4;
var TFHD_FLAG_BASE_DATA_OFFSET = 1;
var TFHD_FLAG_SAMPLE_DESC = 2;
var TFHD_FLAG_SAMPLE_DUR = 8;
var TFHD_FLAG_SAMPLE_SIZE = 16;
var TFHD_FLAG_SAMPLE_FLAGS = 32;
var TFHD_FLAG_DEFAULT_BASE_IS_MOOF = 131072;
var TRUN_FLAGS_DATA_OFFSET = 1;
var TRUN_FLAGS_FIRST_FLAG = 4;
var TRUN_FLAGS_DURATION = 256;
var TRUN_FLAGS_SIZE = 512;
var TRUN_FLAGS_FLAGS = 1024;
var TRUN_FLAGS_CTS_OFFSET = 2048;
var ERR_INVALID_DATA = -1;
var ERR_NOT_ENOUGH_DATA = 0;
var OK = 1;

// src/mp4boxbuffer.ts
var MP4BoxBuffer = class extends ArrayBuffer {
  constructor(byteLength) {
    super(byteLength);
    this.fileStart = 0;
    this.usedBytes = 0;
  }
  static fromArrayBuffer(buffer, fileStart) {
    const mp4BoxBuffer = buffer;
    mp4BoxBuffer.fileStart = fileStart;
    mp4BoxBuffer.usedBytes = 0;
    return mp4BoxBuffer;
  }
};

// src/DataStream.ts
var Endianness = /* @__PURE__ */ ((Endianness2) => {
  Endianness2[Endianness2["BIG_ENDIAN"] = 1] = "BIG_ENDIAN";
  Endianness2[Endianness2["LITTLE_ENDIAN"] = 2] = "LITTLE_ENDIAN";
  return Endianness2;
})(Endianness || {});
var DataStream = class _DataStream {
  /**
   * DataStream reads scalars, arrays and structs of data from an ArrayBuffer.
   * It's like a file-like DataView on steroids.
   *
   * @param arrayBuffer ArrayBuffer to read from.
   * @param byteOffset Offset from arrayBuffer beginning for the DataStream.
   * @param endianness DataStream.BIG_ENDIAN or DataStream.LITTLE_ENDIAN (the default).
   */
  constructor(arrayBuffer, byteOffset, endianness) {
    /**
     * Virtual byte length of the DataStream backing buffer.
     * Updated to be max of original buffer size and last written size.
     * If dynamicSize is false is set to buffer size.
     */
    this._byteLength = 0;
    /**
     * Seek position where DataStream#readStruct ran into a problem.
     * Useful for debugging struct parsing.
     *
     * @type {number}
     */
    this.failurePosition = 0;
    /**
     * Whether to extend DataStream buffer when trying to write beyond its size.
     * If set, the buffer is reallocated to twice its current size until the
     * requested write fits the buffer.
     *
     * @type {boolean}
     * @bundle DataStream-write.js
     */
    this._dynamicSize = 1;
    this._byteOffset = byteOffset || 0;
    if (arrayBuffer instanceof ArrayBuffer) {
      this.buffer = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);
    } else if (arrayBuffer instanceof DataView) {
      this.dataView = arrayBuffer;
      if (byteOffset) this._byteOffset += byteOffset;
    } else {
      this.buffer = new MP4BoxBuffer(arrayBuffer || 0);
    }
    this.position = 0;
    this.endianness = endianness ? endianness : 2 /* LITTLE_ENDIAN */;
  }
  static {
    this.ENDIANNESS = new Int8Array(new Int16Array([1]).buffer)[0] > 0 ? 2 /* LITTLE_ENDIAN */ : 1 /* BIG_ENDIAN */;
  }
  getPosition() {
    return this.position;
  }
  /**
   * Internal function to resize the DataStream buffer when required.
   * @param extra Number of bytes to add to the buffer allocation.
   */
  _realloc(extra) {
    if (!this._dynamicSize) {
      return;
    }
    const req = this._byteOffset + this.position + extra;
    let blen = this._buffer.byteLength;
    if (req <= blen) {
      if (req > this._byteLength) {
        this._byteLength = req;
      }
      return;
    }
    if (blen < 1) {
      blen = 1;
    }
    while (req > blen) {
      blen *= 2;
    }
    const buf = new MP4BoxBuffer(blen);
    const src = new Uint8Array(this._buffer);
    const dst = new Uint8Array(buf, 0, src.length);
    dst.set(src);
    this.buffer = buf;
    this._byteLength = req;
  }
  /**
   * Internal function to trim the DataStream buffer when required.
   * Used for stripping out the extra bytes from the backing buffer when
   * the virtual byteLength is smaller than the buffer byteLength (happens after
   * growing the buffer with writes and not filling the extra space completely).
   */
  _trimAlloc() {
    if (this._byteLength === this._buffer.byteLength) {
      return;
    }
    const buf = new MP4BoxBuffer(this._byteLength);
    const dst = new Uint8Array(buf);
    const src = new Uint8Array(this._buffer, 0, dst.length);
    dst.set(src);
    this.buffer = buf;
  }
  /**
   * Returns the byte length of the DataStream object.
   * @type {number}
   */
  get byteLength() {
    return this._byteLength - this._byteOffset;
  }
  /**
   * Set/get the backing ArrayBuffer of the DataStream object.
   * The setter updates the DataView to point to the new buffer.
   * @type {Object}
   */
  get buffer() {
    this._trimAlloc();
    return this._buffer;
  }
  set buffer(value) {
    this._buffer = value;
    this._dataView = new DataView(value, this._byteOffset);
    this._byteLength = value.byteLength;
  }
  /**
   * Set/get the byteOffset of the DataStream object.
   * The setter updates the DataView to point to the new byteOffset.
   * @type {number}
   */
  get byteOffset() {
    return this._byteOffset;
  }
  set byteOffset(value) {
    this._byteOffset = value;
    this._dataView = new DataView(this._buffer, this._byteOffset);
    this._byteLength = this._buffer.byteLength;
  }
  /**
   * Set/get the byteOffset of the DataStream object.
   * The setter updates the DataView to point to the new byteOffset.
   * @type {number}
   */
  get dataView() {
    return this._dataView;
  }
  set dataView(value) {
    this._byteOffset = value.byteOffset;
    this._buffer = MP4BoxBuffer.fromArrayBuffer(value.buffer, 0);
    this._dataView = new DataView(this._buffer, this._byteOffset);
    this._byteLength = this._byteOffset + value.byteLength;
  }
  /**
   *   Sets the DataStream read/write position to given position.
   *   Clamps between 0 and DataStream length.
   *
   *   @param pos Position to seek to.
   *   @return
   */
  seek(pos) {
    const npos = Math.max(0, Math.min(this.byteLength, pos));
    this.position = isNaN(npos) || !isFinite(npos) ? 0 : npos;
  }
  /**
   * Returns true if the DataStream seek pointer is at the end of buffer and
   * there's no more data to read.
   *
   * @return True if the seek pointer is at the end of the buffer.
   */
  isEof() {
    return this.position >= this._byteLength;
  }
  #isTupleType(type) {
    return Array.isArray(type) && type.length === 3 && type[0] === "[]";
  }
  /**
   * Maps a Uint8Array into the DataStream buffer.
   *
   * Nice for quickly reading in data.
   *
   * @param length Number of elements to map.
   * @param e Endianness of the data to read.
   * @return Uint8Array to the DataStream backing buffer.
   */
  mapUint8Array(length) {
    this._realloc(length * 1);
    const arr = new Uint8Array(this._buffer, this.byteOffset + this.position, length);
    this.position += length * 1;
    return arr;
  }
  /**
   * Reads an Int32Array of desired length and endianness from the DataStream.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return The read Int32Array.
   */
  readInt32Array(length, endianness) {
    length = length === null ? this.byteLength - this.position / 4 : length;
    const arr = new Int32Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads an Int16Array of desired length and endianness from the DataStream.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return The read Int16Array.
   */
  readInt16Array(length, endianness) {
    length = length === null ? this.byteLength - this.position / 2 : length;
    const arr = new Int16Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads an Int8Array of desired length from the DataStream.
   *
   * @param length Number of elements to map.
   * @param e Endianness of the data to read.
   * @return The read Int8Array.
   */
  readInt8Array(length) {
    length = length === null ? this.byteLength - this.position : length;
    const arr = new Int8Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads a Uint32Array of desired length and endianness from the DataStream.
   *
   *  @param length Number of elements to map.
   *  @param endianness Endianness of the data to read.
   *  @return The read Uint32Array.
   */
  readUint32Array(length, endianness) {
    length = length === null ? this.byteLength - this.position / 4 : length;
    const arr = new Uint32Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads a Uint16Array of desired length and endianness from the DataStream.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return The read Uint16Array.
   */
  readUint16Array(length, endianness) {
    length = length === null ? this.byteLength - this.position / 2 : length;
    const arr = new Uint16Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads a Uint8Array of desired length from the DataStream.
   *
   * @param length Number of elements to map.
   * @param e Endianness of the data to read.
   * @return The read Uint8Array.
   */
  readUint8Array(length) {
    length = length === void 0 ? this.byteLength - this.position : length;
    const arr = new Uint8Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads a Float64Array of desired length and endianness from the DataStream.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return The read Float64Array.
   */
  readFloat64Array(length, endianness) {
    length = length === null ? this.byteLength - this.position / 8 : length;
    const arr = new Float64Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads a Float32Array of desired length and endianness from the DataStream.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return The read Float32Array.
   */
  readFloat32Array(length, endianness) {
    length = length === null ? this.byteLength - this.position / 4 : length;
    const arr = new Float32Array(length);
    _DataStream.memcpy(
      arr.buffer,
      0,
      this.buffer,
      this.byteOffset + this.position,
      length * arr.BYTES_PER_ELEMENT
    );
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
   * Reads a 32-bit int from the DataStream with the desired endianness.
   *
   * @param endianness Endianness of the number.
   * @return The read number.
   */
  readInt32(endianness) {
    const v = this._dataView.getInt32(
      this.position,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 4;
    return v;
  }
  /**
   * Reads a 16-bit int from the DataStream with the desired endianness.
   *
   * @param endianness Endianness of the number.
   * @return The read number.
   */
  readInt16(endianness) {
    const v = this._dataView.getInt16(
      this.position,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 2;
    return v;
  }
  /**
   * Reads an 8-bit int from the DataStream.
   *
   * @return The read number.
   */
  readInt8() {
    const v = this._dataView.getInt8(this.position);
    this.position += 1;
    return v;
  }
  /**
   * Reads a 32-bit unsigned int from the DataStream with the desired endianness.
   *
   * @param endianness Endianness of the number.
   * @return The read number.
   */
  readUint32(endianness) {
    const v = this._dataView.getUint32(
      this.position,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 4;
    return v;
  }
  /**
   * Reads a 16-bit unsigned int from the DataStream with the desired endianness.
   *
   * @param endianness Endianness of the number.
   * @return The read number.
   */
  readUint16(endianness) {
    const v = this._dataView.getUint16(
      this.position,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 2;
    return v;
  }
  /**
   * Reads an 8-bit unsigned int from the DataStream.
   *
   * @return The read number.
   */
  readUint8() {
    const v = this._dataView.getUint8(this.position);
    this.position += 1;
    return v;
  }
  /**
   * Reads a 32-bit float from the DataStream with the desired endianness.
   *
   * @param endianness Endianness of the number.
   * @return The read number.
   */
  readFloat32(endianness) {
    const value = this._dataView.getFloat32(
      this.position,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 4;
    return value;
  }
  /**
   * Reads a 64-bit float from the DataStream with the desired endianness.
   *
   * @param endianness Endianness of the number.
   * @return The read number.
   */
  readFloat64(endianness) {
    const value = this._dataView.getFloat64(
      this.position,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 8;
    return value;
  }
  /**
   * Copies byteLength bytes from the src buffer at srcOffset to the
   * dst buffer at dstOffset.
   *
   * @param dst Destination ArrayBuffer to write to.
   * @param dstOffset Offset to the destination ArrayBuffer.
   * @param src Source ArrayBuffer to read from.
   * @param srcOffset Offset to the source ArrayBuffer.
   * @param byteLength Number of bytes to copy.
   */
  static memcpy(dst, dstOffset, src, srcOffset, byteLength) {
    const dstU8 = new Uint8Array(dst, dstOffset, byteLength);
    const srcU8 = new Uint8Array(src, srcOffset, byteLength);
    dstU8.set(srcU8);
  }
  /**
   * Converts array to native endianness in-place.
   *
   * @param typedArray Typed array to convert.
   * @param endianness True if the data in the array is
   *                                      little-endian. Set false for big-endian.
   * @return The converted typed array.
   */
  static arrayToNative(typedArray, endianness) {
    if (endianness === _DataStream.ENDIANNESS) {
      return typedArray;
    } else {
      return this.flipArrayEndianness(typedArray);
    }
  }
  /**
   * Converts native endianness array to desired endianness in-place.
   *
   * @param typedArray Typed array to convert.
   * @param littleEndian True if the converted array should be
   *                               little-endian. Set false for big-endian.
   * @return The converted typed array.
   */
  static nativeToEndian(typedArray, littleEndian) {
    if (littleEndian && _DataStream.ENDIANNESS === 2 /* LITTLE_ENDIAN */) {
      return typedArray;
    } else {
      return this.flipArrayEndianness(typedArray);
    }
  }
  /**
   * Flips typed array endianness in-place.
   *
   * @param typedArray Typed array to flip.
   * @return The converted typed array.
   */
  static flipArrayEndianness(typedArray) {
    const u8 = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    for (let i = 0; i < typedArray.byteLength; i += typedArray.BYTES_PER_ELEMENT) {
      for (let j = i + typedArray.BYTES_PER_ELEMENT - 1, k = i; j > k; j--, k++) {
        const tmp = u8[k];
        u8[k] = u8[j];
        u8[j] = tmp;
      }
    }
    return typedArray;
  }
  /**
   * Read a string of desired length and encoding from the DataStream.
   *
   * @param length The length of the string to read in bytes.
   * @param encoding The encoding of the string data in the DataStream.
   *                           Defaults to ASCII.
   * @return The read string.
   */
  readString(length, encoding) {
    if (encoding === null || encoding === "ASCII") {
      return fromCharCodeUint8(
        this.mapUint8Array(length === null ? this.byteLength - this.position : length)
      );
    } else {
      return new TextDecoder(encoding).decode(this.mapUint8Array(length));
    }
  }
  /**
   * Read null-terminated string of desired length from the DataStream. Truncates
   * the returned string so that the null byte is not a part of it.
   *
   * @param length The length of the string to read.
   * @return The read string.
   */
  readCString(length) {
    let i = 0;
    const blen = this.byteLength - this.position;
    const u8 = new Uint8Array(this._buffer, this._byteOffset + this.position);
    const len = length !== void 0 ? Math.min(length, blen) : blen;
    for (; i < len && u8[i] !== 0; i++) ;
    const s = fromCharCodeUint8(this.mapUint8Array(i));
    if (length !== void 0) {
      this.position += len - i;
    } else if (i !== blen) {
      this.position += 1;
    }
    return s;
  }
  readInt64() {
    return this.readInt32() * MAX_SIZE + this.readUint32();
  }
  readUint64() {
    return this.readUint32() * MAX_SIZE + this.readUint32();
  }
  readUint24() {
    return (this.readUint8() << 16) + (this.readUint8() << 8) + this.readUint8();
  }
  /**
   * Saves the DataStream contents to the given filename.
   * Uses Chrome's anchor download property to initiate download.
   *
   * @param filename Filename to save as.
   * @return
   * @bundle DataStream-write.js
   */
  save(filename) {
    const blob = new Blob([this.buffer]);
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      if (window.URL && URL.createObjectURL) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        document.body.appendChild(a);
        a.setAttribute("href", url);
        a.setAttribute("download", filename);
        a.setAttribute("target", "_self");
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        throw new Error("DataStream.save: Can't create object URL.");
      }
    }
    return blob;
  }
  /** @bundle DataStream-write.js */
  get dynamicSize() {
    return this._dynamicSize;
  }
  /** @bundle DataStream-write.js */
  set dynamicSize(v) {
    if (!v) {
      this._trimAlloc();
    }
    this._dynamicSize = v;
  }
  /**
   * Internal function to trim the DataStream buffer when required.
   * Used for stripping out the first bytes when not needed anymore.
   *
   * @return
   * @bundle DataStream-write.js
   */
  shift(offset) {
    const buf = new MP4BoxBuffer(this._byteLength - offset);
    const dst = new Uint8Array(buf);
    const src = new Uint8Array(this._buffer, offset, dst.length);
    dst.set(src);
    this.buffer = buf;
    this.position -= offset;
  }
  /**
   * Writes an Int32Array of specified endianness to the DataStream.
   *
   * @param array The array to write.
   * @param endianness Endianness of the data to write.
   * @bundle DataStream-write.js
   */
  writeInt32Array(array, endianness) {
    this._realloc(array.length * 4);
    if (array instanceof Int32Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapInt32Array(array.length, endianness);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeInt32(array[i], endianness);
      }
    }
  }
  /**
   * Writes an Int16Array of specified endianness to the DataStream.
   *
   * @param array The array to write.
   * @param endianness Endianness of the data to write.
   * @bundle DataStream-write.js
   */
  writeInt16Array(array, endianness) {
    this._realloc(array.length * 2);
    if (array instanceof Int16Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapInt16Array(array.length, endianness);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeInt16(array[i], endianness);
      }
    }
  }
  /**
   * Writes an Int8Array to the DataStream.
   *
   * @param array The array to write.
   * @bundle DataStream-write.js
   */
  writeInt8Array(array) {
    this._realloc(array.length * 1);
    if (array instanceof Int8Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapInt8Array(array.length);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeInt8(array[i]);
      }
    }
  }
  /**
   * Writes a Uint32Array of specified endianness to the DataStream.
   *
   * @param array The array to write.
   * @param endianness Endianness of the data to write.
   * @bundle DataStream-write.js
   */
  writeUint32Array(array, endianness) {
    this._realloc(array.length * 4);
    if (array instanceof Uint32Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapUint32Array(array.length, endianness);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeUint32(array[i], endianness);
      }
    }
  }
  /**
   * Writes a Uint16Array of specified endianness to the DataStream.
   *
   * @param array The array to write.
   * @param endianness Endianness of the data to write.
   * @bundle DataStream-write.js
   */
  writeUint16Array(array, endianness) {
    this._realloc(array.length * 2);
    if (array instanceof Uint16Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapUint16Array(array.length, endianness);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeUint16(array[i], endianness);
      }
    }
  }
  /**
   * Writes a Uint8Array to the DataStream.
   *
   * @param array The array to write.
   * @bundle DataStream-write.js
   */
  writeUint8Array(array) {
    this._realloc(array.length * 1);
    if (array instanceof Uint8Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapUint8Array(array.length);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeUint8(array[i]);
      }
    }
  }
  /**
   * Writes a Float64Array of specified endianness to the DataStream.
   *
   * @param array The array to write.
   * @param endianness Endianness of the data to write.
   * @bundle DataStream-write.js
   */
  writeFloat64Array(array, endianness) {
    this._realloc(array.length * 8);
    if (array instanceof Float64Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapFloat64Array(array.length, endianness);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeFloat64(array[i], endianness);
      }
    }
  }
  /**
   * Writes a Float32Array of specified endianness to the DataStream.
   *
   * @param array The array to write.
   * @param endianness Endianness of the data to write.
   * @bundle DataStream-write.js
   */
  writeFloat32Array(array, endianness) {
    this._realloc(array.length * 4);
    if (array instanceof Float32Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      _DataStream.memcpy(
        this._buffer,
        this.byteOffset + this.position,
        array.buffer,
        0,
        array.byteLength
      );
      this.mapFloat32Array(array.length, endianness);
    } else {
      for (let i = 0; i < array.length; i++) {
        this.writeFloat32(array[i], endianness);
      }
    }
  }
  /**
   * Writes a 64-bit int to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeInt64(value, endianness) {
    this._realloc(8);
    this._dataView.setBigInt64(
      this.position,
      BigInt(value),
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 8;
  }
  /**
   * Writes a 32-bit int to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeInt32(value, endianness) {
    this._realloc(4);
    this._dataView.setInt32(
      this.position,
      value,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 4;
  }
  /**
   * Writes a 16-bit int to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeInt16(value, endianness) {
    this._realloc(2);
    this._dataView.setInt16(
      this.position,
      value,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 2;
  }
  /**
   * Writes an 8-bit int to the DataStream.
   *
   * @param value Number to write.
   * @bundle DataStream-write.js
   */
  writeInt8(value) {
    this._realloc(1);
    this._dataView.setInt8(this.position, value);
    this.position += 1;
  }
  /**
   * Writes a 32-bit unsigned int to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeUint32(value, endianness) {
    this._realloc(4);
    this._dataView.setUint32(
      this.position,
      value,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 4;
  }
  /**
   * Writes a 16-bit unsigned int to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeUint16(value, endianness) {
    this._realloc(2);
    this._dataView.setUint16(
      this.position,
      value,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 2;
  }
  /**
   * Writes an 8-bit unsigned  int to the DataStream.
   *
   * @param value Number to write.
   * @bundle DataStream-write.js
   */
  writeUint8(value) {
    this._realloc(1);
    this._dataView.setUint8(this.position, value);
    this.position += 1;
  }
  /**
   * Writes a 32-bit float to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeFloat32(value, endianness) {
    this._realloc(4);
    this._dataView.setFloat32(
      this.position,
      value,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 4;
  }
  /**
   * Writes a 64-bit float to the DataStream with the desired endianness.
   *
   * @param value Number to write.
   * @param endianness Endianness of the number.
   * @bundle DataStream-write.js
   */
  writeFloat64(value, endianness) {
    this._realloc(8);
    this._dataView.setFloat64(
      this.position,
      value,
      (endianness ?? this.endianness) === 2 /* LITTLE_ENDIAN */
    );
    this.position += 8;
  }
  /**
   * Write a UCS-2 string of desired endianness to the DataStream. The
   * lengthOverride argument lets you define the number of characters to write.
   * If the string is shorter than lengthOverride, the extra space is padded with
   * zeroes.
   *
   * @param value The string to write.
   * @param endianness The endianness to use for the written string data.
   * @param lengthOverride The number of characters to write.
   * @bundle DataStream-write.js
   */
  writeUCS2String(value, endianness, lengthOverride) {
    if (lengthOverride === null) {
      lengthOverride = value.length;
    }
    let i;
    for (i = 0; i < value.length && i < lengthOverride; i++) {
      this.writeUint16(value.charCodeAt(i), endianness);
    }
    for (; i < lengthOverride; i++) {
      this.writeUint16(0);
    }
  }
  /**
   * Writes a string of desired length and encoding to the DataStream.
   *
   * @param value The string to write.
   * @param encoding The encoding for the written string data.
   *                           Defaults to ASCII.
   * @param length The number of characters to write.
   * @bundle DataStream-write.js
   */
  writeString(value, encoding, length) {
    let i = 0;
    if (encoding === null || encoding === "ASCII") {
      if (length !== null) {
        const len = Math.min(value.length, length);
        for (i = 0; i < len; i++) {
          this.writeUint8(value.charCodeAt(i));
        }
        for (; i < length; i++) {
          this.writeUint8(0);
        }
      } else {
        for (i = 0; i < value.length; i++) {
          this.writeUint8(value.charCodeAt(i));
        }
      }
    } else {
      this.writeUint8Array(new TextEncoder(encoding).encode(value.substring(0, length)));
    }
  }
  /**
   * Writes a null-terminated string to DataStream and zero-pads it to length
   * bytes. If length is not given, writes the string followed by a zero.
   * If string is longer than length, the written part of the string does not have
   * a trailing zero.
   *
   * @param value The string to write.
   * @param length The number of characters to write.
   * @bundle DataStream-write.js
   */
  writeCString(value, length) {
    let i = 0;
    if (length !== void 0) {
      const len = Math.min(value.length, length);
      for (i = 0; i < len; i++) {
        this.writeUint8(value.charCodeAt(i));
      }
      for (; i < length; i++) {
        this.writeUint8(0);
      }
    } else {
      for (i = 0; i < value.length; i++) {
        this.writeUint8(value.charCodeAt(i));
      }
      this.writeUint8(0);
    }
  }
  /**
   * Writes a struct to the DataStream. Takes a structDefinition that gives the
   * types and a struct object that gives the values. Refer to readStruct for the
   * structure of structDefinition.
   *
   * @param structDefinition Type definition of the struct.
   * @param struct The struct data object.
   * @bundle DataStream-write.js
   */
  writeStruct(structDefinition, struct) {
    for (let i = 0; i < structDefinition.length; i++) {
      const [structName, structType] = structDefinition[i];
      const structValue = struct[structName];
      this.writeType(structType, structValue, struct);
    }
  }
  /**
   * Writes object v of type t to the DataStream.
   *
   * @param type Type of data to write.
   * @param value Value of data to write.
   * @param struct Struct to pass to write callback functions.
   * @bundle DataStream-write.js
   */
  writeType(type, value, struct) {
    if (typeof type === "function") {
      return type(this, value);
    } else if (typeof type === "object" && !(type instanceof Array)) {
      return type.set(this, value, struct);
    }
    let lengthOverride = null;
    let charset = "ASCII";
    const pos = this.position;
    let parsedType = type;
    if (typeof type === "string" && /:/.test(type)) {
      const tp = type.split(":");
      parsedType = tp[0];
      lengthOverride = parseInt(tp[1]);
    }
    if (typeof parsedType === "string" && /,/.test(parsedType)) {
      const tp = parsedType.split(",");
      parsedType = tp[0];
      charset = tp[1];
    }
    switch (parsedType) {
      case "uint8":
        this.writeUint8(value);
        break;
      case "int8":
        this.writeInt8(value);
        break;
      case "uint16":
        this.writeUint16(value, this.endianness);
        break;
      case "int16":
        this.writeInt16(value, this.endianness);
        break;
      case "uint32":
        this.writeUint32(value, this.endianness);
        break;
      case "int32":
        this.writeInt32(value, this.endianness);
        break;
      case "float32":
        this.writeFloat32(value, this.endianness);
        break;
      case "float64":
        this.writeFloat64(value, this.endianness);
        break;
      case "uint16be":
        this.writeUint16(value, 1 /* BIG_ENDIAN */);
        break;
      case "int16be":
        this.writeInt16(value, 1 /* BIG_ENDIAN */);
        break;
      case "uint32be":
        this.writeUint32(value, 1 /* BIG_ENDIAN */);
        break;
      case "int32be":
        this.writeInt32(value, 1 /* BIG_ENDIAN */);
        break;
      case "float32be":
        this.writeFloat32(value, 1 /* BIG_ENDIAN */);
        break;
      case "float64be":
        this.writeFloat64(value, 1 /* BIG_ENDIAN */);
        break;
      case "uint16le":
        this.writeUint16(value, 2 /* LITTLE_ENDIAN */);
        break;
      case "int16le":
        this.writeInt16(value, 2 /* LITTLE_ENDIAN */);
        break;
      case "uint32le":
        this.writeUint32(value, 2 /* LITTLE_ENDIAN */);
        break;
      case "int32le":
        this.writeInt32(value, 2 /* LITTLE_ENDIAN */);
        break;
      case "float32le":
        this.writeFloat32(value, 2 /* LITTLE_ENDIAN */);
        break;
      case "float64le":
        this.writeFloat64(value, 2 /* LITTLE_ENDIAN */);
        break;
      case "cstring":
        this.writeCString(value, lengthOverride);
        break;
      case "string":
        this.writeString(value, charset, lengthOverride);
        break;
      case "u16string":
        this.writeUCS2String(value, this.endianness, lengthOverride);
        break;
      case "u16stringle":
        this.writeUCS2String(value, 2 /* LITTLE_ENDIAN */, lengthOverride);
        break;
      case "u16stringbe":
        this.writeUCS2String(value, 1 /* BIG_ENDIAN */, lengthOverride);
        break;
      default:
        if (this.#isTupleType(parsedType)) {
          const [, ta] = parsedType;
          for (let i = 0; i < value.length; i++) {
            this.writeType(ta, value[i]);
          }
          break;
        } else {
          this.writeStruct(parsedType, value);
          break;
        }
    }
    if (lengthOverride !== null) {
      this.position = pos;
      this._realloc(lengthOverride);
      this.position = pos + lengthOverride;
    }
  }
  /** @bundle DataStream-write.js */
  writeUint64(value) {
    const h = Math.floor(value / MAX_SIZE);
    this.writeUint32(h);
    this.writeUint32(value & 4294967295);
  }
  /** @bundle DataStream-write.js */
  writeUint24(value) {
    this.writeUint8((value & 16711680) >> 16);
    this.writeUint8((value & 65280) >> 8);
    this.writeUint8(value & 255);
  }
  /** @bundle DataStream-write.js */
  adjustUint32(position, value) {
    const pos = this.position;
    this.seek(position);
    this.writeUint32(value);
    this.seek(pos);
  }
  /**
   * Reads a struct of data from the DataStream. The struct is defined as
   * an array of [name, type]-pairs. See the example below:
   *
   * ```ts
   * ds.readStruct([
   *   ['headerTag', 'uint32'], // Uint32 in DataStream endianness.
   *   ['headerTag2', 'uint32be'], // Big-endian Uint32.
   *   ['headerTag3', 'uint32le'], // Little-endian Uint32.
   *   ['array', ['[]', 'uint32', 16]], // Uint32Array of length 16.
   *   ['array2', ['[]', 'uint32', 'array2Length']] // Uint32Array of length array2Length
   * ]);
   * ```
   *
   * The possible values for the type are as follows:
   *
   * ## Number types
   *
   * Unsuffixed number types use DataStream endianness.
   * To explicitly specify endianness, suffix the type with
   * 'le' for little-endian or 'be' for big-endian,
   * e.g. 'int32be' for big-endian int32.
   *
   * - `uint8` -- 8-bit unsigned int
   * - `uint16` -- 16-bit unsigned int
   * - `uint32` -- 32-bit unsigned int
   * - `int8` -- 8-bit int
   * - `int16` -- 16-bit int
   * - `int32` -- 32-bit int
   * - `float32` -- 32-bit float
   * - `float64` -- 64-bit float
   *
   * ## String types
   *
   * - `cstring` -- ASCII string terminated by a zero byte.
   * - `string:N` -- ASCII string of length N.
   * - `string,CHARSET:N` -- String of byteLength N encoded with given CHARSET.
   * - `u16string:N` -- UCS-2 string of length N in DataStream endianness.
   * - `u16stringle:N` -- UCS-2 string of length N in little-endian.
   * - `u16stringbe:N` -- UCS-2 string of length N in big-endian.
   *
   * ## Complex types
   *
   * ### Struct
   * ```ts
   * [[name, type], [name_2, type_2], ..., [name_N, type_N]]
   * ```
   *
   * ### Callback function to read and return data
   * ```ts
   * function(dataStream, struct) {}
   * ```
   *
   * ###  Getter/setter functions
   * to read and return data, handy for using the same struct definition
   * for reading and writing structs.
   * ```ts
   * {
   *    get: function(dataStream, struct) {},
   *    set: function(dataStream, struct) {}
   * }
   * ```
   *
   * ### Array
   * Array of given type and length. The length can be either
   * - a number
   * - a string that references a previously-read field
   * - `*`
   * - a callback: `function(struct, dataStream, type){}`
   *
   * If length is `*`, reads in as many elements as it can.
   * ```ts
   * ['[]', type, length]
   * ```
   *
   * @param structDefinition Struct definition object.
   * @return The read struct. Null if failed to read struct.
   * @bundle DataStream-read-struct.js
   */
  readStruct(structDefinition) {
    const struct = {};
    const p = this.position;
    for (let i = 0; i < structDefinition.length; i += 1) {
      const t = structDefinition[i][1];
      const v = this.readType(t, struct);
      if (v === null) {
        if (this.failurePosition === 0) {
          this.failurePosition = this.position;
        }
        this.position = p;
        return null;
      }
      struct[structDefinition[i][0]] = v;
    }
    return struct;
  }
  /**
   * Read UCS-2 string of desired length and endianness from the DataStream.
   *
   * @param length The length of the string to read.
   * @param endianness The endianness of the string data in the DataStream.
   * @return The read string.
   * @bundle DataStream-read-struct.js
   */
  readUCS2String(length, endianness) {
    return String.fromCharCode.apply(null, this.readUint16Array(length, endianness));
  }
  /**
   * Reads an object of type t from the DataStream, passing struct as the thus-far
   * read struct to possible callbacks that refer to it. Used by readStruct for
   * reading in the values, so the type is one of the readStruct types.
   *
   * @param type Type of the object to read.
   * @param struct Struct to refer to when resolving length references
   *                         and for calling callbacks.
   * @return  Returns the object on successful read, null on unsuccessful.
   * @bundle DataStream-read-struct.js
   */
  readType(type, struct) {
    if (typeof type === "function") {
      return type(this, struct);
    }
    if (typeof type === "object" && !(type instanceof Array)) {
      return type.get(this, struct);
    }
    if (type instanceof Array && type.length !== 3) {
      return this.readStruct(type);
    }
    let value = null;
    let lengthOverride = null;
    let charset = "ASCII";
    const pos = this.position;
    let parsedType = type;
    if (typeof parsedType === "string" && /:/.test(parsedType)) {
      const tp = parsedType.split(":");
      parsedType = tp[0];
      lengthOverride = parseInt(tp[1]);
    }
    if (typeof parsedType === "string" && /,/.test(parsedType)) {
      const tp = parsedType.split(",");
      parsedType = tp[0];
      charset = tp[1];
    }
    switch (parsedType) {
      case "uint8":
        value = this.readUint8();
        break;
      case "int8":
        value = this.readInt8();
        break;
      case "uint16":
        value = this.readUint16(this.endianness);
        break;
      case "int16":
        value = this.readInt16(this.endianness);
        break;
      case "uint32":
        value = this.readUint32(this.endianness);
        break;
      case "int32":
        value = this.readInt32(this.endianness);
        break;
      case "float32":
        value = this.readFloat32(this.endianness);
        break;
      case "float64":
        value = this.readFloat64(this.endianness);
        break;
      case "uint16be":
        value = this.readUint16(1 /* BIG_ENDIAN */);
        break;
      case "int16be":
        value = this.readInt16(1 /* BIG_ENDIAN */);
        break;
      case "uint32be":
        value = this.readUint32(1 /* BIG_ENDIAN */);
        break;
      case "int32be":
        value = this.readInt32(1 /* BIG_ENDIAN */);
        break;
      case "float32be":
        value = this.readFloat32(1 /* BIG_ENDIAN */);
        break;
      case "float64be":
        value = this.readFloat64(1 /* BIG_ENDIAN */);
        break;
      case "uint16le":
        value = this.readUint16(2 /* LITTLE_ENDIAN */);
        break;
      case "int16le":
        value = this.readInt16(2 /* LITTLE_ENDIAN */);
        break;
      case "uint32le":
        value = this.readUint32(2 /* LITTLE_ENDIAN */);
        break;
      case "int32le":
        value = this.readInt32(2 /* LITTLE_ENDIAN */);
        break;
      case "float32le":
        value = this.readFloat32(2 /* LITTLE_ENDIAN */);
        break;
      case "float64le":
        value = this.readFloat64(2 /* LITTLE_ENDIAN */);
        break;
      case "cstring":
        value = this.readCString(lengthOverride);
        break;
      case "string":
        value = this.readString(lengthOverride, charset);
        break;
      case "u16string":
        value = this.readUCS2String(lengthOverride, this.endianness);
        break;
      case "u16stringle":
        value = this.readUCS2String(lengthOverride, 2 /* LITTLE_ENDIAN */);
        break;
      case "u16stringbe":
        value = this.readUCS2String(lengthOverride, 1 /* BIG_ENDIAN */);
        break;
      default:
        if (this.#isTupleType(parsedType)) {
          const [, ta, len] = parsedType;
          const length = typeof len === "function" ? len(struct, this, parsedType) : typeof len === "string" && struct[len] !== null ? (
            // @ts-expect-error   FIXME: Struct[string] is currently of type Type
            parseInt(struct[len])
          ) : typeof len === "number" ? len : len === "*" ? null : parseInt(len);
          if (typeof ta === "string") {
            const tap = ta.replace(/(le|be)$/, "");
            let endianness;
            if (/le$/.test(ta)) {
              endianness = 2 /* LITTLE_ENDIAN */;
            } else if (/be$/.test(ta)) {
              endianness = 1 /* BIG_ENDIAN */;
            }
            switch (tap) {
              case "uint8":
                value = this.readUint8Array(length);
                break;
              case "uint16":
                value = this.readUint16Array(length, endianness);
                break;
              case "uint32":
                value = this.readUint32Array(length, endianness);
                break;
              case "int8":
                value = this.readInt8Array(length);
                break;
              case "int16":
                value = this.readInt16Array(length, endianness);
                break;
              case "int32":
                value = this.readInt32Array(length, endianness);
                break;
              case "float32":
                value = this.readFloat32Array(length, endianness);
                break;
              case "float64":
                value = this.readFloat64Array(length, endianness);
                break;
              case "cstring":
              case "utf16string":
              case "string":
                if (length === null) {
                  value = [];
                  while (!this.isEof()) {
                    const u = this.readType(ta, struct);
                    if (u === null) break;
                    value.push(u);
                  }
                } else {
                  value = new Array(length);
                  for (let i = 0; i < length; i++) {
                    value[i] = this.readType(ta, struct);
                  }
                }
                break;
            }
          } else {
            if (length === null) {
              value = [];
              while (true) {
                const pos2 = this.position;
                try {
                  const type2 = this.readType(ta, struct);
                  if (type2 === null) {
                    this.position = pos2;
                    break;
                  }
                  value.push(type2);
                } catch {
                  this.position = pos2;
                  break;
                }
              }
            } else {
              value = new Array(length);
              for (let i = 0; i < length; i++) {
                const type2 = this.readType(ta, struct);
                if (type2 === null) return null;
                value[i] = type2;
              }
            }
          }
          break;
        }
    }
    if (lengthOverride !== null) {
      this.position = pos + lengthOverride;
    }
    return value;
  }
  /**
   * Maps an Int32Array into the DataStream buffer, swizzling it to native
   * endianness in-place. The current offset from the start of the buffer needs to
   * be a multiple of element size, just like with typed array views.
   *
   * Nice for quickly reading in data. Warning: potentially modifies the buffer
   * contents.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Int32Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapInt32Array(length, endianness) {
    this._realloc(length * 4);
    const arr = new Int32Array(this._buffer, this.byteOffset + this.position, length);
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += length * 4;
    return arr;
  }
  /**
   * Maps an Int16Array into the DataStream buffer, swizzling it to native
   * endianness in-place. The current offset from the start of the buffer needs to
   * be a multiple of element size, just like with typed array views.
   *
   * Nice for quickly reading in data. Warning: potentially modifies the buffer
   * contents.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Int16Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapInt16Array(length, endianness) {
    this._realloc(length * 2);
    const arr = new Int16Array(this._buffer, this.byteOffset + this.position, length);
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += length * 2;
    return arr;
  }
  /**
   * Maps an Int8Array into the DataStream buffer.
   *
   * Nice for quickly reading in data.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Int8Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapInt8Array(length, _endianness) {
    this._realloc(length * 1);
    const arr = new Int8Array(this._buffer, this.byteOffset + this.position, length);
    this.position += length * 1;
    return arr;
  }
  /**
   * Maps a Uint32Array into the DataStream buffer, swizzling it to native
   * endianness in-place. The current offset from the start of the buffer needs to
   * be a multiple of element size, just like with typed array views.
   *
   * Nice for quickly reading in data. Warning: potentially modifies the buffer
   * contents.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Uint32Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapUint32Array(length, endianness) {
    this._realloc(length * 4);
    const arr = new Uint32Array(this._buffer, this.byteOffset + this.position, length);
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += length * 4;
    return arr;
  }
  /**
   * Maps a Uint16Array into the DataStream buffer, swizzling it to native
   * endianness in-place. The current offset from the start of the buffer needs to
   * be a multiple of element size, just like with typed array views.
   *
   * Nice for quickly reading in data. Warning: potentially modifies the buffer
   * contents.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Uint16Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapUint16Array(length, endianness) {
    this._realloc(length * 2);
    const arr = new Uint16Array(this._buffer, this.byteOffset + this.position, length);
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += length * 2;
    return arr;
  }
  /**
   * Maps a Float64Array into the DataStream buffer, swizzling it to native
   * endianness in-place. The current offset from the start of the buffer needs to
   * be a multiple of element size, just like with typed array views.
   *
   * Nice for quickly reading in data. Warning: potentially modifies the buffer
   * contents.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Float64Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapFloat64Array(length, endianness) {
    this._realloc(length * 8);
    const arr = new Float64Array(this._buffer, this.byteOffset + this.position, length);
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += length * 8;
    return arr;
  }
  /**
   * Maps a Float32Array into the DataStream buffer, swizzling it to native
   * endianness in-place. The current offset from the start of the buffer needs to
   * be a multiple of element size, just like with typed array views.
   *
   * Nice for quickly reading in data. Warning: potentially modifies the buffer
   * contents.
   *
   * @param length Number of elements to map.
   * @param endianness Endianness of the data to read.
   * @return Float32Array to the DataStream backing buffer.
   * @bundle DataStream-map.js
   */
  mapFloat32Array(length, endianness) {
    this._realloc(length * 4);
    const arr = new Float32Array(this._buffer, this.byteOffset + this.position, length);
    _DataStream.arrayToNative(arr, endianness ?? this.endianness);
    this.position += length * 4;
    return arr;
  }
};
function fromCharCodeUint8(uint8arr) {
  const arr = [];
  for (let i = 0; i < uint8arr.length; i++) {
    arr[i] = uint8arr[i];
  }
  return String.fromCharCode.apply(null, arr);
}

// src/log.ts
var start = /* @__PURE__ */ new Date();
var LOG_LEVEL_ERROR = 4;
var LOG_LEVEL_WARNING = 3;
var LOG_LEVEL_INFO = 2;
var LOG_LEVEL_DEBUG = 1;
var log_level = LOG_LEVEL_ERROR;
var Log = {
  setLogLevel(level) {
    if (level === this.debug) log_level = LOG_LEVEL_DEBUG;
    else if (level === this.info) log_level = LOG_LEVEL_INFO;
    else if (level === this.warn) log_level = LOG_LEVEL_WARNING;
    else if (level === this.error) log_level = LOG_LEVEL_ERROR;
    else log_level = LOG_LEVEL_ERROR;
  },
  debug(module, msg) {
    if (console.debug === void 0) {
      console.debug = console.log;
    }
    if (LOG_LEVEL_DEBUG >= log_level) {
      console.debug(
        "[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]",
        "[" + module + "]",
        msg
      );
    }
  },
  log(module, _msg) {
    this.debug(module.msg);
  },
  info(module, msg) {
    if (LOG_LEVEL_INFO >= log_level) {
      console.info(
        "[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]",
        "[" + module + "]",
        msg
      );
    }
  },
  warn(module, msg) {
    if (LOG_LEVEL_WARNING >= log_level) {
      console.warn(
        "[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]",
        "[" + module + "]",
        msg
      );
    }
  },
  error(module, msg, isofile) {
    if (isofile?.onError) {
      isofile.onError(module, msg);
    } else if (LOG_LEVEL_ERROR >= log_level) {
      console.error(
        "[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]",
        "[" + module + "]",
        msg
      );
    }
  },
  /* Helper function to print a duration value in the form H:MM:SS.MS */
  getDurationString(duration, _timescale) {
    let neg;
    function pad(number, length) {
      const str = "" + number;
      const a = str.split(".");
      while (a[0].length < length) {
        a[0] = "0" + a[0];
      }
      return a.join(".");
    }
    if (duration < 0) {
      neg = true;
      duration = -duration;
    } else {
      neg = false;
    }
    const timescale = _timescale || 1;
    let duration_sec = duration / timescale;
    const hours = Math.floor(duration_sec / 3600);
    duration_sec -= hours * 3600;
    const minutes = Math.floor(duration_sec / 60);
    duration_sec -= minutes * 60;
    let msec = duration_sec * 1e3;
    duration_sec = Math.floor(duration_sec);
    msec -= duration_sec * 1e3;
    msec = Math.floor(msec);
    return (neg ? "-" : "") + hours + ":" + pad(minutes, 2) + ":" + pad(duration_sec, 2) + "." + pad(msec, 3);
  },
  /* Helper function to stringify HTML5 TimeRanges objects */
  printRanges(ranges) {
    const length = ranges.length;
    if (length > 0) {
      let str = "";
      for (let i = 0; i < length; i++) {
        if (i > 0) str += ",";
        str += "[" + Log.getDurationString(ranges.start(i)) + "," + Log.getDurationString(ranges.end(i)) + "]";
      }
      return str;
    } else {
      return "(empty)";
    }
  }
};

// src/buffer.ts
function concatBuffers(buffer1, buffer2) {
  Log.debug(
    "ArrayBuffer",
    "Trying to create a new buffer of size: " + (buffer1.byteLength + buffer2.byteLength)
  );
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
}
var MultiBufferStream = class extends DataStream {
  constructor(buffer) {
    super(new ArrayBuffer(), 0, 1 /* BIG_ENDIAN */);
    this.isofile = null;
    this.buffers = [];
    this.bufferIndex = -1;
    if (buffer) {
      this.insertBuffer(buffer);
      this.bufferIndex = 0;
    }
  }
  /***********************************************************************************
   *                     Methods for the managnement of the buffers                  *
   *                     (insertion, removal, concatenation, ...)                    *
   ***********************************************************************************/
  initialized() {
    if (this.bufferIndex > -1) {
      return true;
    } else if (this.buffers.length > 0) {
      const firstBuffer = this.buffers[0];
      if (firstBuffer.fileStart === 0) {
        this.buffer = firstBuffer;
        this.bufferIndex = 0;
        Log.debug("MultiBufferStream", "Stream ready for parsing");
        return true;
      } else {
        Log.warn("MultiBufferStream", "The first buffer should have a fileStart of 0");
        this.logBufferLevel();
        return false;
      }
    } else {
      Log.warn("MultiBufferStream", "No buffer to start parsing from");
      this.logBufferLevel();
      return false;
    }
  }
  /**
   * Reduces the size of a given buffer, but taking the part between offset and offset+newlength
   * @param  {ArrayBuffer} buffer
   * @param  {Number}      offset    the start of new buffer
   * @param  {Number}      newLength the length of the new buffer
   * @return {ArrayBuffer}           the new buffer
   */
  reduceBuffer(buffer, offset, newLength) {
    const smallB = new Uint8Array(newLength);
    smallB.set(new Uint8Array(buffer, offset, newLength));
    smallB.buffer.fileStart = buffer.fileStart + offset;
    smallB.buffer.usedBytes = 0;
    return smallB.buffer;
  }
  /**
   * Inserts the new buffer in the sorted list of buffers,
   *  making sure, it is not overlapping with existing ones (possibly reducing its size).
   *  if the new buffer overrides/replaces the 0-th buffer (for instance because it is bigger),
   *  updates the DataStream buffer for parsing
   */
  insertBuffer(ab) {
    let to_add = true;
    let i = 0;
    for (; i < this.buffers.length; i++) {
      const b = this.buffers[i];
      if (ab.fileStart <= b.fileStart) {
        if (ab.fileStart === b.fileStart) {
          if (ab.byteLength > b.byteLength) {
            this.buffers.splice(i, 1);
            i--;
            continue;
          } else {
            Log.warn(
              "MultiBufferStream",
              "Buffer (fileStart: " + ab.fileStart + " - Length: " + ab.byteLength + ") already appended, ignoring"
            );
          }
        } else {
          if (ab.fileStart + ab.byteLength <= b.fileStart) {
          } else {
            ab = this.reduceBuffer(ab, 0, b.fileStart - ab.fileStart);
          }
          Log.debug(
            "MultiBufferStream",
            "Appending new buffer (fileStart: " + ab.fileStart + " - Length: " + ab.byteLength + ")"
          );
          this.buffers.splice(i, 0, ab);
          if (i === 0) {
            this.buffer = ab;
          }
        }
        to_add = false;
        break;
      } else if (ab.fileStart < b.fileStart + b.byteLength) {
        const offset = b.fileStart + b.byteLength - ab.fileStart;
        const newLength = ab.byteLength - offset;
        if (newLength > 0) {
          ab = this.reduceBuffer(ab, offset, newLength);
        } else {
          to_add = false;
          break;
        }
      }
    }
    if (to_add) {
      Log.debug(
        "MultiBufferStream",
        "Appending new buffer (fileStart: " + ab.fileStart + " - Length: " + ab.byteLength + ")"
      );
      this.buffers.push(ab);
      if (i === 0) {
        this.buffer = ab;
      }
    }
  }
  /**
   * Displays the status of the buffers (number and used bytes)
   * @param  {Object} info callback method for display
   */
  logBufferLevel(info) {
    const ranges = [];
    let bufferedString = "";
    let range;
    let used = 0;
    let total = 0;
    for (let i = 0; i < this.buffers.length; i++) {
      const buffer = this.buffers[i];
      if (i === 0) {
        range = {
          start: buffer.fileStart,
          end: buffer.fileStart + buffer.byteLength
        };
        ranges.push(range);
        bufferedString += "[" + range.start + "-";
      } else if (range.end === buffer.fileStart) {
        range.end = buffer.fileStart + buffer.byteLength;
      } else {
        range = {
          start: buffer.fileStart,
          end: buffer.fileStart + buffer.byteLength
        };
        bufferedString += ranges[ranges.length - 1].end - 1 + "], [" + range.start + "-";
        ranges.push(range);
      }
      used += buffer.usedBytes;
      total += buffer.byteLength;
    }
    if (ranges.length > 0) {
      bufferedString += range.end - 1 + "]";
    }
    const log = info ? Log.info : Log.debug;
    if (this.buffers.length === 0) {
      log("MultiBufferStream", "No more buffer in memory");
    } else {
      log(
        "MultiBufferStream",
        "" + this.buffers.length + " stored buffer(s) (" + used + "/" + total + " bytes), continuous ranges: " + bufferedString
      );
    }
  }
  cleanBuffers() {
    for (let i = 0; i < this.buffers.length; i++) {
      const buffer = this.buffers[i];
      if (buffer.usedBytes === buffer.byteLength) {
        Log.debug("MultiBufferStream", "Removing buffer #" + i);
        this.buffers.splice(i, 1);
        i--;
      }
    }
  }
  mergeNextBuffer() {
    if (this.bufferIndex + 1 < this.buffers.length) {
      const next_buffer = this.buffers[this.bufferIndex + 1];
      if (next_buffer.fileStart === this.buffer.fileStart + this.buffer.byteLength) {
        const oldLength = this.buffer.byteLength;
        const oldUsedBytes = this.buffer.usedBytes;
        const oldFileStart = this.buffer.fileStart;
        this.buffers[this.bufferIndex] = concatBuffers(this.buffer, next_buffer);
        this.buffer = this.buffers[this.bufferIndex];
        this.buffers.splice(this.bufferIndex + 1, 1);
        this.buffer.usedBytes = oldUsedBytes;
        this.buffer.fileStart = oldFileStart;
        Log.debug(
          "ISOFile",
          "Concatenating buffer for box parsing (length: " + oldLength + "->" + this.buffer.byteLength + ")"
        );
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  /*************************************************************************
   *                        Seek-related functions                         *
   *************************************************************************/
  /**
   * Finds the buffer that holds the given file position
   * @param  {Boolean} fromStart    indicates if the search should start from the current buffer (false)
   *                                or from the first buffer (true)
   * @param  {Number}  filePosition position in the file to seek to
   * @param  {Boolean} markAsUsed   indicates if the bytes in between the current position and the seek position
   *                                should be marked as used for garbage collection
   * @return {Number}               the index of the buffer holding the seeked file position, -1 if not found.
   */
  findPosition(fromStart, filePosition, markAsUsed) {
    let index = -1;
    let i = fromStart === true ? 0 : this.bufferIndex;
    while (i < this.buffers.length) {
      const abuffer2 = this.buffers[i];
      if (abuffer2 && abuffer2.fileStart <= filePosition) {
        index = i;
        if (markAsUsed) {
          if (abuffer2.fileStart + abuffer2.byteLength <= filePosition) {
            abuffer2.usedBytes = abuffer2.byteLength;
          } else {
            abuffer2.usedBytes = filePosition - abuffer2.fileStart;
          }
          this.logBufferLevel();
        }
      } else {
        break;
      }
      i++;
    }
    if (index === -1) {
      return -1;
    }
    const abuffer = this.buffers[index];
    if (abuffer.fileStart + abuffer.byteLength >= filePosition) {
      Log.debug("MultiBufferStream", "Found position in existing buffer #" + index);
      return index;
    } else {
      return -1;
    }
  }
  /**
   * Finds the largest file position contained in a buffer or in the next buffers if they are contiguous (no gap)
   * starting from the given buffer index or from the current buffer if the index is not given
   *
   * @param  {Number} inputindex Index of the buffer to start from
   * @return {Number}            The largest file position found in the buffers
   */
  findEndContiguousBuf(inputindex) {
    const index = inputindex !== void 0 ? inputindex : this.bufferIndex;
    let currentBuf = this.buffers[index];
    if (this.buffers.length > index + 1) {
      for (let i = index + 1; i < this.buffers.length; i++) {
        const nextBuf = this.buffers[i];
        if (nextBuf.fileStart === currentBuf.fileStart + currentBuf.byteLength) {
          currentBuf = nextBuf;
        } else {
          break;
        }
      }
    }
    return currentBuf.fileStart + currentBuf.byteLength;
  }
  /**
   * Returns the largest file position contained in the buffers, larger than the given position
   * @param  {Number} pos the file position to start from
   * @return {Number}     the largest position in the current buffer or in the buffer and the next contiguous
   *                      buffer that holds the given position
   */
  getEndFilePositionAfter(pos) {
    const index = this.findPosition(true, pos, false);
    if (index !== -1) {
      return this.findEndContiguousBuf(index);
    } else {
      return pos;
    }
  }
  /*************************************************************************
   *                  Garbage collection related functions                 *
   *************************************************************************/
  /**
   * Marks a given number of bytes as used in the current buffer for garbage collection
   * @param {Number} nbBytes
   */
  addUsedBytes(nbBytes) {
    this.buffer.usedBytes += nbBytes;
    this.logBufferLevel();
  }
  /**
   * Marks the entire current buffer as used, ready for garbage collection
   */
  setAllUsedBytes() {
    this.buffer.usedBytes = this.buffer.byteLength;
    this.logBufferLevel();
  }
  /*************************************************************************
   *          Common API between MultiBufferStream and SimpleStream        *
   *************************************************************************/
  /**
   * Tries to seek to a given file position
   * if possible, repositions the parsing from there and returns true
   * if not possible, does not change anything and returns false
   * @param  {Number}  filePosition position in the file to seek to
   * @param  {Boolean} fromStart    indicates if the search should start from the current buffer (false)
   *                                or from the first buffer (true)
   * @param  {Boolean} markAsUsed   indicates if the bytes in between the current position and the seek position
   *                                should be marked as used for garbage collection
   * @return {Boolean}              true if the seek succeeded, false otherwise
   */
  seek(filePosition, fromStart, markAsUsed) {
    const index = this.findPosition(fromStart, filePosition, markAsUsed);
    if (index !== -1) {
      this.buffer = this.buffers[index];
      this.bufferIndex = index;
      this.position = filePosition - this.buffer.fileStart;
      Log.debug("MultiBufferStream", "Repositioning parser at buffer position: " + this.position);
      return true;
    } else {
      Log.debug("MultiBufferStream", "Position " + filePosition + " not found in buffered data");
      return false;
    }
  }
  /**
   * Returns the current position in the file
   * @return {Number} the position in the file
   */
  getPosition() {
    if (this.bufferIndex === -1 || this.buffers[this.bufferIndex] === null) return 0;
    return this.buffers[this.bufferIndex].fileStart + this.position;
  }
  /**
   * Returns the length of the current buffer
   * @return {Number} the length of the current buffer
   */
  getLength() {
    return this.byteLength;
  }
  getEndPosition() {
    if (this.bufferIndex === -1 || this.buffers[this.bufferIndex] === null) return 0;
    return this.buffers[this.bufferIndex].fileStart + this.byteLength;
  }
  getAbsoluteEndPosition() {
    if (this.buffers.length === 0) return 0;
    const lastBuffer = this.buffers[this.buffers.length - 1];
    return lastBuffer.fileStart + lastBuffer.byteLength;
  }
};

// src/stream.ts
var MP4BoxStream = class {
  constructor(arrayBuffer) {
    this.position = 0;
    if (arrayBuffer instanceof ArrayBuffer) {
      this.buffer = arrayBuffer;
      this.dataview = new DataView(arrayBuffer);
    } else {
      throw new Error("Needs an array buffer");
    }
  }
  /*************************************************************************
   *         Common API between MultiBufferStream and SimpleStream         *
   *************************************************************************/
  getPosition() {
    return this.position;
  }
  getEndPosition() {
    return this.buffer.byteLength;
  }
  getLength() {
    return this.buffer.byteLength;
  }
  seek(pos) {
    const npos = Math.max(0, Math.min(this.buffer.byteLength, pos));
    this.position = isNaN(npos) || !isFinite(npos) ? 0 : npos;
    return true;
  }
  isEos() {
    return this.getPosition() >= this.getEndPosition();
  }
  /*************************************************************************
   *            Read methods, simimar to DataStream but simpler            *
   *************************************************************************/
  readAnyInt(size, signed) {
    let res = 0;
    if (this.position + size <= this.buffer.byteLength) {
      switch (size) {
        case 1:
          if (signed) {
            res = this.dataview.getInt8(this.position);
          } else {
            res = this.dataview.getUint8(this.position);
          }
          break;
        case 2:
          if (signed) {
            res = this.dataview.getInt16(this.position);
          } else {
            res = this.dataview.getUint16(this.position);
          }
          break;
        case 3:
          if (signed) {
            throw new Error("No method for reading signed 24 bits values");
          } else {
            res = this.dataview.getUint8(this.position) << 16;
            res |= this.dataview.getUint8(this.position + 1) << 8;
            res |= this.dataview.getUint8(this.position + 2);
          }
          break;
        case 4:
          if (signed) {
            res = this.dataview.getInt32(this.position);
          } else {
            res = this.dataview.getUint32(this.position);
          }
          break;
        case 8:
          if (signed) {
            throw new Error("No method for reading signed 64 bits values");
          } else {
            res = this.dataview.getUint32(this.position) << 32;
            res |= this.dataview.getUint32(this.position + 4);
          }
          break;
        default:
          throw new Error("readInt method not implemented for size: " + size);
      }
      this.position += size;
      return res;
    } else {
      throw new Error("Not enough bytes in buffer");
    }
  }
  readUint8() {
    return this.readAnyInt(1, false);
  }
  readUint16() {
    return this.readAnyInt(2, false);
  }
  readUint24() {
    return this.readAnyInt(3, false);
  }
  readUint32() {
    return this.readAnyInt(4, false);
  }
  readUint64() {
    return this.readAnyInt(8, false);
  }
  readString(length) {
    if (this.position + length <= this.buffer.byteLength) {
      let s = "";
      for (let i = 0; i < length; i++) {
        s += String.fromCharCode(this.readUint8());
      }
      return s;
    } else {
      throw new Error("Not enough bytes in buffer");
    }
  }
  readCString() {
    const arr = [];
    while (true) {
      const b = this.readUint8();
      if (b !== 0) {
        arr.push(b);
      } else {
        break;
      }
    }
    return String.fromCharCode.apply(null, arr);
  }
  readInt8() {
    return this.readAnyInt(1, true);
  }
  readInt16() {
    return this.readAnyInt(2, true);
  }
  readInt32() {
    return this.readAnyInt(4, true);
  }
  readInt64() {
    return this.readAnyInt(8, false);
  }
  readUint8Array(length) {
    const arr = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = this.readUint8();
    }
    return arr;
  }
  readInt16Array(length) {
    const arr = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = this.readInt16();
    }
    return arr;
  }
  readUint16Array(length) {
    const arr = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = this.readUint16();
    }
    return arr;
  }
  readUint32Array(length) {
    const arr = new Uint32Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = this.readUint32();
    }
    return arr;
  }
  readInt32Array(length) {
    const arr = new Int32Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = this.readInt32();
    }
    return arr;
  }
};

// src/box.ts
var Box = class {
  constructor(size = 0) {
    this.size = size;
  }
  static {
    this.registryId = Symbol.for("BoxIdentifier");
  }
  // Handle box designation (4CC)
  // Instance-defined type (used for dynamic box types)
  #type;
  get type() {
    return this.constructor.fourcc ?? this.#type;
  }
  set type(value) {
    this.#type = value;
  }
  addBox(box) {
    if (!this.boxes) {
      this.boxes = [];
    }
    this.boxes.push(box);
    if (this[box.type + "s"]) {
      this[box.type + "s"].push(box);
    } else {
      this[box.type] = box;
    }
    return box;
  }
  set(prop, value) {
    this[prop] = value;
    return this;
  }
  addEntry(value, _prop) {
    const prop = _prop || "entries";
    if (!this[prop]) {
      this[prop] = [];
    }
    this[prop].push(value);
    return this;
  }
  /** @bundle box-write.js */
  writeHeader(stream, msg) {
    this.size += 8;
    if (this.size > MAX_SIZE || this.original_size === 1) {
      this.size += 8;
    }
    if (this.type === "uuid") {
      this.size += 16;
    }
    Log.debug(
      "BoxWriter",
      "Writing box " + this.type + " of size: " + this.size + " at position " + stream.getPosition() + (msg || "")
    );
    if (this.original_size === 0) {
      stream.writeUint32(0);
    } else if (this.size > MAX_SIZE || this.original_size === 1) {
      stream.writeUint32(1);
    } else {
      this.sizePosition = stream.getPosition();
      stream.writeUint32(this.size);
    }
    stream.writeString(this.type, null, 4);
    if (this.type === "uuid") {
      const uuidBytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        uuidBytes[i] = parseInt(this.uuid.substring(i * 2, i * 2 + 2), 16);
      }
      stream.writeUint8Array(uuidBytes);
    }
    if (this.size > MAX_SIZE || this.original_size === 1) {
      this.sizePosition = stream.getPosition();
      stream.writeUint64(this.size);
    }
  }
  /** @bundle box-write.js */
  write(stream) {
    if (this.type === "mdat") {
      const box = this;
      if (box.stream) {
        this.size = box.stream.getAbsoluteEndPosition();
        this.writeHeader(stream);
        for (const buffer of box.stream.buffers) {
          const u8 = new Uint8Array(buffer);
          stream.writeUint8Array(u8);
        }
      }
    } else {
      this.size = this.data ? this.data.length : 0;
      this.writeHeader(stream);
      if (this.data) {
        stream.writeUint8Array(this.data);
      }
    }
  }
  /** @bundle box-print.js */
  printHeader(output) {
    this.size += 8;
    if (this.size > MAX_SIZE) {
      this.size += 8;
    }
    if (this.type === "uuid") {
      this.size += 16;
    }
    output.log(output.indent + "size:" + this.size);
    output.log(output.indent + "type:" + this.type);
  }
  /** @bundle box-print.js */
  print(output) {
    this.printHeader(output);
  }
  /** @bundle box-parse.js */
  parse(stream) {
    if (this.type !== "mdat") {
      this.data = stream.readUint8Array(this.size - this.hdr_size);
    } else {
      if (this.size === 0) {
        stream.seek(stream.getEndPosition());
      } else {
        stream.seek(this.start + this.size);
      }
    }
  }
  /** @bundle box-parse.js */
  parseDataAndRewind(stream) {
    this.data = stream.readUint8Array(this.size - this.hdr_size);
    stream.seek(this.start + this.hdr_size);
  }
  /** @bundle box-parse.js */
  parseLanguage(stream) {
    this.language = stream.readUint16();
    const chars = [];
    chars[0] = this.language >> 10 & 31;
    chars[1] = this.language >> 5 & 31;
    chars[2] = this.language & 31;
    this.languageString = String.fromCharCode(chars[0] + 96, chars[1] + 96, chars[2] + 96);
  }
  /** @bundle isofile-advanced-creation.js */
  computeSize(stream_) {
    const stream = stream_ || new MultiBufferStream();
    stream.endianness = 1 /* BIG_ENDIAN */;
    this.write(stream);
  }
  isEndOfBox(stream) {
    const pos = stream.getPosition();
    const end = this.start + this.size;
    return pos === end;
  }
};
var FullBox = class extends Box {
  constructor() {
    super(...arguments);
    this.flags = 0;
    this.version = 0;
  }
  /** @bundle box-write.js */
  writeHeader(stream) {
    this.size += 4;
    super.writeHeader(stream, " v=" + this.version + " f=" + this.flags);
    stream.writeUint8(this.version);
    stream.writeUint24(this.flags);
  }
  /** @bundle box-print.js */
  printHeader(output) {
    this.size += 4;
    super.printHeader(output);
    output.log(output.indent + "version:" + this.version);
    output.log(output.indent + "flags:" + this.flags);
  }
  /** @bundle box-parse.js */
  parseDataAndRewind(stream) {
    this.parseFullHeader(stream);
    this.data = stream.readUint8Array(this.size - this.hdr_size);
    this.hdr_size -= 4;
    stream.seek(this.start + this.hdr_size);
  }
  /** @bundle box-parse.js */
  parseFullHeader(stream) {
    this.version = stream.readUint8();
    this.flags = stream.readUint24();
    this.hdr_size += 4;
  }
  /** @bundle box-parse.js */
  parse(stream) {
    this.parseFullHeader(stream);
    this.data = stream.readUint8Array(this.size - this.hdr_size);
  }
};
var SampleGroupEntry = class {
  constructor(grouping_type) {
    this.grouping_type = grouping_type;
  }
  static {
    this.registryId = Symbol.for("SampleGroupEntryIdentifier");
  }
  /** @bundle writing/samplegroups/samplegroup.js */
  write(stream) {
    stream.writeUint8Array(this.data);
  }
  /** @bundle parsing/samplegroups/samplegroup.js */
  parse(stream) {
    Log.warn("BoxParser", `Unknown sample group type: '${this.grouping_type}'`);
    this.data = stream.readUint8Array(this.description_length);
  }
};
var TrackGroupTypeBox = class extends FullBox {
  /** @bundle parsing/TrackGroup.js */
  parse(stream) {
    this.parseFullHeader(stream);
    this.track_group_id = stream.readUint32();
  }
};
var SingleItemTypeReferenceBox = class extends Box {
  constructor(fourcc, size, box_name, hdr_size, start2) {
    super(size);
    this.box_name = box_name;
    this.hdr_size = hdr_size;
    this.start = start2;
    this.type = fourcc;
  }
  parse(stream) {
    this.from_item_ID = stream.readUint16();
    const count = stream.readUint16();
    this.references = [];
    for (let i = 0; i < count; i++) {
      this.references[i] = {
        to_item_ID: stream.readUint16()
      };
    }
  }
};
var SingleItemTypeReferenceBoxLarge = class extends Box {
  constructor(fourcc, size, box_name, hdr_size, start2) {
    super(size);
    this.box_name = box_name;
    this.hdr_size = hdr_size;
    this.start = start2;
    this.type = fourcc;
  }
  parse(stream) {
    this.from_item_ID = stream.readUint32();
    const count = stream.readUint16();
    this.references = [];
    for (let i = 0; i < count; i++) {
      this.references[i] = {
        to_item_ID: stream.readUint32()
      };
    }
  }
};
var TrackReferenceTypeBox = class extends Box {
  constructor(fourcc, size, hdr_size, start2) {
    super(size);
    this.hdr_size = hdr_size;
    this.start = start2;
    this.type = fourcc;
  }
  parse(stream) {
    this.track_ids = stream.readUint32Array((this.size - this.hdr_size) / 4);
  }
  /** @bundle box-write.js */
  write(stream) {
    this.size = this.track_ids.length * 4;
    this.writeHeader(stream);
    stream.writeUint32Array(this.track_ids);
  }
};

// src/box-diff.ts
var DIFF_BOXES_PROP_NAMES = [
  "boxes",
  "entries",
  "references",
  "subsamples",
  "items",
  "item_infos",
  "extents",
  "associations",
  "subsegments",
  "ranges",
  "seekLists",
  "seekPoints",
  "esd",
  "levels"
];
var DIFF_PRIMITIVE_ARRAY_PROP_NAMES = [
  "compatible_brands",
  "matrix",
  "opcolor",
  "sample_counts",
  "sample_deltas",
  "first_chunk",
  "samples_per_chunk",
  "sample_sizes",
  "chunk_offsets",
  "sample_offsets",
  "sample_description_index",
  "sample_duration"
];
function boxEqualFields(box_a, box_b) {
  if (box_a && !box_b) return false;
  let prop;
  for (prop in box_a) {
    if (DIFF_BOXES_PROP_NAMES.find((name) => name === prop)) {
      continue;
    } else if (box_a[prop] instanceof Box || box_b[prop] instanceof Box) {
      continue;
    } else if (typeof box_a[prop] === "undefined" || typeof box_b[prop] === "undefined") {
      continue;
    } else if (typeof box_a[prop] === "function" || typeof box_b[prop] === "function") {
      continue;
    } else if ("subBoxNames" in box_a && box_a.subBoxNames.indexOf(prop.slice(0, 4)) > -1 || "subBoxNames" in box_b && box_b.subBoxNames.indexOf(prop.slice(0, 4)) > -1) {
      continue;
    } else {
      if (prop === "data" || prop === "start" || prop === "size" || prop === "creation_time" || prop === "modification_time") {
        continue;
      } else if (DIFF_PRIMITIVE_ARRAY_PROP_NAMES.find((name) => name === prop)) {
        continue;
      } else {
        if (box_a[prop] !== box_b[prop]) {
          return false;
        }
      }
    }
  }
  return true;
}
function boxEqual(box_a, box_b) {
  if (!boxEqualFields(box_a, box_b)) {
    return false;
  }
  for (let j = 0; j < DIFF_BOXES_PROP_NAMES.length; j++) {
    const name = DIFF_BOXES_PROP_NAMES[j];
    if (box_a[name] && box_b[name]) {
      if (!boxEqual(box_a[name], box_b[name])) {
        return false;
      }
    }
  }
  return true;
}

// src/registry.ts
function getRegistryId(boxClass) {
  let current = boxClass;
  while (current) {
    if ("registryId" in current) {
      return current["registryId"];
    }
    current = Object.getPrototypeOf(current);
  }
  return void 0;
}
var isSampleGroupEntry = (value) => {
  const symbol = Symbol.for("SampleGroupEntryIdentifier");
  return getRegistryId(value) === symbol;
};
var isSampleEntry = (value) => {
  const symbol = Symbol.for("SampleEntryIdentifier");
  return getRegistryId(value) === symbol;
};
var isBox = (value) => {
  const symbol = Symbol.for("BoxIdentifier");
  return getRegistryId(value) === symbol;
};
var BoxRegistry = {
  uuid: {},
  sampleEntry: {},
  sampleGroupEntry: {},
  box: {}
};
function registerBoxes(registry) {
  const localRegistry = {
    uuid: {},
    sampleEntry: {},
    sampleGroupEntry: {},
    box: {}
  };
  for (const [key, value] of Object.entries(registry)) {
    if (isSampleGroupEntry(value)) {
      const groupingType = "grouping_type" in value ? value.grouping_type : void 0;
      if (!groupingType) {
        throw new Error(
          `SampleGroupEntry class ${key} does not have a valid static grouping_type. Please ensure it is defined correctly.`
        );
      }
      if (groupingType in localRegistry.sampleGroupEntry) {
        throw new Error(
          `SampleGroupEntry class ${key} has a grouping_type that is already registered. Please ensure it is unique.`
        );
      }
      localRegistry.sampleGroupEntry[groupingType] = value;
      continue;
    }
    if (isSampleEntry(value)) {
      const fourcc = "fourcc" in value ? value.fourcc : void 0;
      if (!fourcc) {
        throw new Error(
          `SampleEntry class ${key} does not have a valid static fourcc. Please ensure it is defined correctly.`
        );
      }
      if (fourcc in localRegistry.sampleEntry) {
        throw new Error(
          `SampleEntry class ${key} has a fourcc that is already registered. Please ensure it is unique.`
        );
      }
      localRegistry.sampleEntry[fourcc] = value;
      continue;
    }
    if (isBox(value)) {
      const fourcc = "fourcc" in value ? value.fourcc : null;
      const uuid = "uuid" in value ? value.uuid : null;
      if (fourcc === "uuid") {
        if (!uuid) {
          throw new Error(
            `Box class ${key} has a fourcc of 'uuid' but does not have a valid uuid. Please ensure it is defined correctly.`
          );
        }
        if (uuid in localRegistry.uuid) {
          throw new Error(
            `Box class ${key} has a uuid that is already registered. Please ensure it is unique.`
          );
        }
        localRegistry.uuid[uuid] = value;
        continue;
      }
      localRegistry.box[fourcc] = value;
      continue;
    }
    throw new Error(
      `Box class ${key} does not have a valid static fourcc, uuid, or grouping_type. Please ensure it is defined correctly.`
    );
  }
  BoxRegistry.uuid = { ...localRegistry.uuid };
  BoxRegistry.sampleEntry = { ...localRegistry.sampleEntry };
  BoxRegistry.sampleGroupEntry = { ...localRegistry.sampleGroupEntry };
  BoxRegistry.box = { ...localRegistry.box };
  return BoxRegistry;
}
var DescriptorRegistry = {};
function registerDescriptors(registry) {
  Object.entries(registry).forEach(([key, value]) => DescriptorRegistry[key] = value);
  return DescriptorRegistry;
}

// src/parser.ts
function parseUUID(stream) {
  return parseHex16(stream);
}
function parseHex16(stream) {
  let hex16 = "";
  for (let i = 0; i < 16; i++) {
    const hex = stream.readUint8().toString(16);
    hex16 += hex.length === 1 ? "0" + hex : hex;
  }
  return hex16;
}
function parseOneBox(stream, headerOnly, parentSize) {
  let box;
  let originalSize;
  const start2 = stream.getPosition();
  let hdr_size = 0;
  let uuid;
  if (stream.getEndPosition() - start2 < 8) {
    Log.debug("BoxParser", "Not enough data in stream to parse the type and size of the box");
    return { code: ERR_NOT_ENOUGH_DATA };
  }
  if (parentSize && parentSize < 8) {
    Log.debug("BoxParser", "Not enough bytes left in the parent box to parse a new box");
    return { code: ERR_NOT_ENOUGH_DATA };
  }
  let size = stream.readUint32();
  const type = stream.readString(4);
  if (type.length !== 4 || !/^[\x20-\x7E]{4}$/.test(type)) {
    Log.error("BoxParser", `Invalid box type: '${type}'`);
    return { code: ERR_INVALID_DATA, start: start2, type };
  }
  let box_type = type;
  Log.debug(
    "BoxParser",
    "Found box of type '" + type + "' and size " + size + " at position " + start2
  );
  hdr_size = 8;
  if (type === "uuid") {
    if (stream.getEndPosition() - stream.getPosition() < 16 || parentSize - hdr_size < 16) {
      stream.seek(start2);
      Log.debug("BoxParser", "Not enough bytes left in the parent box to parse a UUID box");
      return { code: ERR_NOT_ENOUGH_DATA };
    }
    uuid = parseUUID(stream);
    hdr_size += 16;
    box_type = uuid;
  }
  if (size === 1) {
    if (stream.getEndPosition() - stream.getPosition() < 8 || parentSize && parentSize - hdr_size < 8) {
      stream.seek(start2);
      Log.warn(
        "BoxParser",
        'Not enough data in stream to parse the extended size of the "' + type + '" box'
      );
      return { code: ERR_NOT_ENOUGH_DATA };
    }
    originalSize = size;
    size = stream.readUint64();
    hdr_size += 8;
  } else if (size === 0) {
    if (parentSize) {
      size = parentSize;
    } else {
      if (type !== "mdat") {
        Log.error("BoxParser", "Unlimited box size not supported for type: '" + type + "'");
        box = new Box(size);
        box.type = type;
        return { code: OK, box, size: box.size };
      }
    }
  }
  if (size !== 0 && size < hdr_size) {
    Log.error(
      "BoxParser",
      "Box of type " + type + " has an invalid size " + size + " (too small to be a box)"
    );
    return {
      code: ERR_NOT_ENOUGH_DATA,
      type,
      size,
      hdr_size,
      start: start2
    };
  }
  if (size !== 0 && parentSize && size > parentSize) {
    Log.error(
      "BoxParser",
      "Box of type '" + type + "' has a size " + size + " greater than its container size " + parentSize
    );
    return {
      code: ERR_NOT_ENOUGH_DATA,
      type,
      size,
      hdr_size,
      start: start2
    };
  }
  if (size !== 0 && start2 + size > stream.getEndPosition()) {
    stream.seek(start2);
    Log.info("BoxParser", "Not enough data in stream to parse the entire '" + type + "' box");
    return {
      code: ERR_NOT_ENOUGH_DATA,
      type,
      size,
      hdr_size,
      start: start2,
      original_size: originalSize
    };
  }
  if (headerOnly) {
    return { code: OK, type, size, hdr_size, start: start2 };
  } else {
    if (type in BoxRegistry.box) {
      box = new BoxRegistry.box[type](size);
    } else {
      if (type !== "uuid") {
        Log.warn("BoxParser", `Unknown box type: '${type}'`);
        box = new Box(size);
        box.type = type;
        box.has_unparsed_data = true;
      } else {
        if (uuid in BoxRegistry.uuid) {
          box = new BoxRegistry.uuid[uuid](size);
        } else {
          Log.warn("BoxParser", `Unknown UUID box type: '${uuid}'`);
          box = new Box(size);
          box.type = type;
          box.uuid = uuid;
          box.has_unparsed_data = true;
        }
      }
    }
  }
  box.original_size = originalSize;
  box.hdr_size = hdr_size;
  box.start = start2;
  if (box.write === Box.prototype.write && box.type !== "mdat") {
    Log.info(
      "BoxParser",
      "'" + box_type + "' box writing not yet implemented, keeping unparsed data in memory for later write"
    );
    box.parseDataAndRewind(stream);
  }
  box.parse(stream);
  const diff = stream.getPosition() - (box.start + box.size);
  if (diff < 0) {
    Log.warn(
      "BoxParser",
      "Parsing of box '" + box_type + "' did not read the entire indicated box data size (missing " + -diff + " bytes), seeking forward"
    );
    stream.seek(box.start + box.size);
  } else if (diff > 0 && box.size !== 0) {
    Log.error(
      "BoxParser",
      "Parsing of box '" + box_type + "' read " + diff + " more bytes than the indicated box data size, seeking backwards"
    );
    stream.seek(box.start + box.size);
  }
  return { code: OK, box, size: box.size };
}

// src/containerBox.ts
var ContainerBox = class extends Box {
  /** @bundle box-write.js */
  write(stream) {
    this.size = 0;
    this.writeHeader(stream);
    if (this.boxes) {
      for (let i = 0; i < this.boxes.length; i++) {
        if (this.boxes[i]) {
          this.boxes[i].write(stream);
          this.size += this.boxes[i].size;
        }
      }
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream.adjustUint32(this.sizePosition, this.size);
  }
  /** @bundle box-print.js */
  print(output) {
    this.printHeader(output);
    for (let i = 0; i < this.boxes.length; i++) {
      if (this.boxes[i]) {
        const prev_indent = output.indent;
        output.indent += " ";
        this.boxes[i].print(output);
        output.indent = prev_indent;
      }
    }
  }
  /** @bundle box-parse.js */
  parse(stream) {
    let ret;
    while (stream.getPosition() < this.start + this.size) {
      ret = parseOneBox(stream, false, this.size - (stream.getPosition() - this.start));
      if (ret.code === OK) {
        const box = ret.box;
        if (!this.boxes) {
          this.boxes = [];
        }
        this.boxes.push(box);
        if (this.subBoxNames && this.subBoxNames.indexOf(box.type) !== -1) {
          const fourcc = this.subBoxNames[this.subBoxNames.indexOf(box.type)] + "s";
          if (!this[fourcc]) this[fourcc] = [];
          this[fourcc].push(box);
        } else {
          const box_type = box.type !== "uuid" ? box.type : box.uuid;
          if (this[box_type]) {
            Log.warn(
              "ContainerBox",
              `Box of type ${box_type} already exists in container box ${this.type}.`
            );
          } else {
            this[box_type] = box;
          }
        }
      } else {
        return;
      }
    }
  }
};

// src/boxes/sampleentries/base.ts
var SampleEntry = class extends ContainerBox {
  constructor(size, hdr_size, start2) {
    super(size);
    this.hdr_size = hdr_size;
    this.start = start2;
  }
  static {
    this.registryId = Symbol.for("SampleEntryIdentifier");
  }
  /** @bundle box-codecs.js */
  isVideo() {
    return false;
  }
  /** @bundle box-codecs.js */
  isAudio() {
    return false;
  }
  /** @bundle box-codecs.js */
  isSubtitle() {
    return false;
  }
  /** @bundle box-codecs.js */
  isMetadata() {
    return false;
  }
  /** @bundle box-codecs.js */
  isHint() {
    return false;
  }
  /** @bundle box-codecs.js */
  getCodec() {
    return this.type.replace(".", "");
  }
  /** @bundle box-codecs.js */
  getWidth() {
    return "";
  }
  /** @bundle box-codecs.js */
  getHeight() {
    return "";
  }
  /** @bundle box-codecs.js */
  getChannelCount() {
    return "";
  }
  /** @bundle box-codecs.js */
  getSampleRate() {
    return "";
  }
  /** @bundle box-codecs.js */
  getSampleSize() {
    return "";
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parseHeader(stream) {
    stream.readUint8Array(6);
    this.data_reference_index = stream.readUint16();
    this.hdr_size += 8;
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parse(stream) {
    this.parseHeader(stream);
    this.data = stream.readUint8Array(this.size - this.hdr_size);
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parseDataAndRewind(stream) {
    this.parseHeader(stream);
    this.data = stream.readUint8Array(this.size - this.hdr_size);
    this.hdr_size -= 8;
    stream.seek(this.start + this.hdr_size);
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parseFooter(stream) {
    super.parse(stream);
  }
  /** @bundle writing/sampleentry.js */
  writeHeader(stream) {
    this.size = 8;
    super.writeHeader(stream);
    stream.writeUint8(0);
    stream.writeUint8(0);
    stream.writeUint8(0);
    stream.writeUint8(0);
    stream.writeUint8(0);
    stream.writeUint8(0);
    stream.writeUint16(this.data_reference_index);
  }
  /** @bundle writing/sampleentry.js */
  writeFooter(stream) {
    if (this.boxes) {
      for (let i = 0; i < this.boxes.length; i++) {
        this.boxes[i].write(stream);
        this.size += this.boxes[i].size;
      }
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream.adjustUint32(this.sizePosition, this.size);
  }
  /** @bundle writing/sampleentry.js */
  write(stream) {
    this.writeHeader(stream);
    stream.writeUint8Array(this.data);
    this.size += this.data.length;
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream.adjustUint32(this.sizePosition, this.size);
  }
};
var HintSampleEntry = class extends SampleEntry {
};
var MetadataSampleEntry = class extends SampleEntry {
  /** @bundle box-codecs.js */
  isMetadata() {
    return true;
  }
};
var SubtitleSampleEntry = class extends SampleEntry {
  /** @bundle box-codecs.js */
  isSubtitle() {
    return true;
  }
};
var TextSampleEntry = class extends SampleEntry {
};
var VisualSampleEntry = class extends SampleEntry {
  parse(stream) {
    this.parseHeader(stream);
    stream.readUint16();
    stream.readUint16();
    stream.readUint32Array(3);
    this.width = stream.readUint16();
    this.height = stream.readUint16();
    this.horizresolution = stream.readUint32();
    this.vertresolution = stream.readUint32();
    stream.readUint32();
    this.frame_count = stream.readUint16();
    const compressorname_length = Math.min(31, stream.readUint8());
    this.compressorname = stream.readString(compressorname_length);
    if (compressorname_length < 31) {
      stream.readString(31 - compressorname_length);
    }
    this.depth = stream.readUint16();
    stream.readUint16();
    this.parseFooter(stream);
  }
  /** @bundle box-codecs.js */
  isVideo() {
    return true;
  }
  /** @bundle box-codecs.js */
  getWidth() {
    return this.width;
  }
  /** @bundle box-codecs.js */
  getHeight() {
    return this.height;
  }
  /** @bundle writing/sampleentries/sampleentry.js */
  write(stream) {
    this.writeHeader(stream);
    this.size += 2 * 7 + 6 * 4 + 32;
    stream.writeUint16(0);
    stream.writeUint16(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint16(this.width);
    stream.writeUint16(this.height);
    stream.writeUint32(this.horizresolution);
    stream.writeUint32(this.vertresolution);
    stream.writeUint32(0);
    stream.writeUint16(this.frame_count);
    stream.writeUint8(Math.min(31, this.compressorname.length));
    stream.writeString(this.compressorname, null, 31);
    stream.writeUint16(this.depth);
    stream.writeInt16(-1);
    this.writeFooter(stream);
  }
};
var AudioSampleEntry = class extends SampleEntry {
  parse(stream) {
    this.parseHeader(stream);
    stream.readUint32Array(2);
    this.channel_count = stream.readUint16();
    this.samplesize = stream.readUint16();
    stream.readUint16();
    stream.readUint16();
    this.samplerate = stream.readUint32() / (1 << 16);
    this.parseFooter(stream);
  }
  /** @bundle box-codecs.js */
  isAudio() {
    return true;
  }
  /** @bundle box-codecs.js */
  getChannelCount() {
    return this.channel_count;
  }
  /** @bundle box-codecs.js */
  getSampleRate() {
    return this.samplerate;
  }
  /** @bundle box-codecs.js */
  getSampleSize() {
    return this.samplesize;
  }
  /** @bundle writing/sampleentry.js */
  write(stream) {
    this.writeHeader(stream);
    this.size += 2 * 4 + 3 * 4;
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint16(this.channel_count);
    stream.writeUint16(this.samplesize);
    stream.writeUint16(0);
    stream.writeUint16(0);
    stream.writeUint32(this.samplerate << 16);
    this.writeFooter(stream);
  }
};
var SystemSampleEntry = class extends SampleEntry {
  parse(stream) {
    this.parseHeader(stream);
    this.parseFooter(stream);
  }
  /** @bundle writing/sampleentry.js */
  write(stream) {
    this.writeHeader(stream);
    this.writeFooter(stream);
  }
};

// src/boxes/avcC.ts
var avcCBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "AVCConfigurationBox";
  }
  static {
    this.fourcc = "avcC";
  }
  parse(stream) {
    this.configurationVersion = stream.readUint8();
    this.AVCProfileIndication = stream.readUint8();
    this.profile_compatibility = stream.readUint8();
    this.AVCLevelIndication = stream.readUint8();
    this.lengthSizeMinusOne = stream.readUint8() & 3;
    this.nb_SPS_nalus = stream.readUint8() & 31;
    let toparse = this.size - this.hdr_size - 6;
    this.SPS = [];
    for (let i = 0; i < this.nb_SPS_nalus; i++) {
      const length = stream.readUint16();
      this.SPS[i] = {
        length,
        data: stream.readUint8Array(length)
      };
      toparse -= 2 + length;
    }
    this.nb_PPS_nalus = stream.readUint8();
    toparse--;
    this.PPS = [];
    for (let i = 0; i < this.nb_PPS_nalus; i++) {
      const length = stream.readUint16();
      this.PPS[i] = {
        length,
        data: stream.readUint8Array(length)
      };
      toparse -= 2 + length;
    }
    if (toparse > 0) {
      this.ext = stream.readUint8Array(toparse);
    }
  }
  /** @bundle writing/avcC.js */
  write(stream) {
    this.size = 7;
    for (let i = 0; i < this.SPS.length; i++) {
      this.size += 2 + this.SPS[i].length;
    }
    for (let i = 0; i < this.PPS.length; i++) {
      this.size += 2 + this.PPS[i].length;
    }
    if (this.ext) {
      this.size += this.ext.length;
    }
    this.writeHeader(stream);
    stream.writeUint8(this.configurationVersion);
    stream.writeUint8(this.AVCProfileIndication);
    stream.writeUint8(this.profile_compatibility);
    stream.writeUint8(this.AVCLevelIndication);
    stream.writeUint8(this.lengthSizeMinusOne + (63 << 2));
    stream.writeUint8(this.SPS.length + (7 << 5));
    for (let i = 0; i < this.SPS.length; i++) {
      stream.writeUint16(this.SPS[i].length);
      stream.writeUint8Array(this.SPS[i].data);
    }
    stream.writeUint8(this.PPS.length);
    for (let i = 0; i < this.PPS.length; i++) {
      stream.writeUint16(this.PPS[i].length);
      stream.writeUint8Array(this.PPS[i].data);
    }
    if (this.ext) {
      stream.writeUint8Array(this.ext);
    }
  }
};

// src/boxes/defaults.ts
var mdatBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "MediaDataBox";
  }
  static {
    this.fourcc = "mdat";
  }
};
var idatBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "ItemDataBox";
  }
  static {
    this.fourcc = "idat";
  }
};
var freeBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "FreeSpaceBox";
  }
  static {
    this.fourcc = "free";
  }
};
var skipBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "FreeSpaceBox";
  }
  static {
    this.fourcc = "skip";
  }
};
var hmhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "HintMediaHeaderBox";
  }
  static {
    this.fourcc = "hmhd";
  }
};
var nmhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "NullMediaHeaderBox";
  }
  static {
    this.fourcc = "nmhd";
  }
};
var iodsBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ObjectDescriptorBox";
  }
  static {
    this.fourcc = "iods";
  }
};
var xmlBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "XMLBox";
  }
  static {
    this.fourcc = "xml ";
  }
};
var bxmlBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "BinaryXMLBox";
  }
  static {
    this.fourcc = "bxml";
  }
};
var iproBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemProtectionBox";
    this.sinfs = [];
  }
  static {
    this.fourcc = "ipro";
  }
  get protections() {
    return this.sinfs;
  }
};
var moovBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieBox";
    this.traks = [];
    this.psshs = [];
    this.subBoxNames = ["trak", "pssh"];
  }
  static {
    this.fourcc = "moov";
  }
};
var trakBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackBox";
  }
  static {
    this.fourcc = "trak";
  }
};
var edtsBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "EditBox";
  }
  static {
    this.fourcc = "edts";
  }
};
var mdiaBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "MediaBox";
  }
  static {
    this.fourcc = "mdia";
  }
};
var minfBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "MediaInformationBox";
  }
  static {
    this.fourcc = "minf";
  }
};
var dinfBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "DataInformationBox";
  }
  static {
    this.fourcc = "dinf";
  }
};
var stblBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleTableBox";
    this.sgpds = [];
    this.sbgps = [];
    this.subBoxNames = ["sgpd", "sbgp"];
  }
  static {
    this.fourcc = "stbl";
  }
};
var mvexBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieExtendsBox";
    this.trexs = [];
    this.subBoxNames = ["trex"];
  }
  static {
    this.fourcc = "mvex";
  }
};
var moofBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieFragmentBox";
    this.trafs = [];
    this.subBoxNames = ["traf"];
  }
  static {
    this.fourcc = "moof";
  }
};
var trafBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackFragmentBox";
    this.truns = [];
    this.sgpds = [];
    this.sbgps = [];
    this.subBoxNames = ["trun", "sgpd", "sbgp"];
  }
  static {
    this.fourcc = "traf";
  }
};
var vttcBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "VTTCueBox";
  }
  static {
    this.fourcc = "vttc";
  }
};
var mfraBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieFragmentRandomAccessBox";
    this.tfras = [];
    this.subBoxNames = ["tfra"];
  }
  static {
    this.fourcc = "mfra";
  }
};
var mecoBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "AdditionalMetadataContainerBox";
  }
  static {
    this.fourcc = "meco";
  }
};
var hntiBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "trackhintinformation";
    this.subBoxNames = ["sdp ", "rtp "];
  }
  static {
    this.fourcc = "hnti";
  }
};
var hinfBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "hintstatisticsbox";
    this.maxrs = [];
    this.subBoxNames = ["maxr"];
  }
  static {
    this.fourcc = "hinf";
  }
};
var strkBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "SubTrackBox";
  }
  static {
    this.fourcc = "strk";
  }
};
var strdBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "SubTrackDefinitionBox";
  }
  static {
    this.fourcc = "strd";
  }
};
var sinfBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "ProtectionSchemeInfoBox";
  }
  static {
    this.fourcc = "sinf";
  }
};
var rinfBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "RestrictedSchemeInfoBox";
  }
  static {
    this.fourcc = "rinf";
  }
};
var schiBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "SchemeInformationBox";
  }
  static {
    this.fourcc = "schi";
  }
};
var trgrBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackGroupBox";
  }
  static {
    this.fourcc = "trgr";
  }
};
var udtaBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "UserDataBox";
    this.kinds = [];
    this.strks = [];
    this.subBoxNames = ["kind", "strk"];
  }
  static {
    this.fourcc = "udta";
  }
};
var iprpBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemPropertiesBox";
    this.ipmas = [];
    this.subBoxNames = ["ipma"];
  }
  static {
    this.fourcc = "iprp";
  }
};
var ipcoBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemPropertyContainerBox";
    this.hvcCs = [];
    this.ispes = [];
    this.claps = [];
    this.irots = [];
    this.subBoxNames = ["hvcC", "ispe", "clap", "irot"];
  }
  static {
    this.fourcc = "ipco";
  }
};
var grplBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "GroupsListBox";
  }
  static {
    this.fourcc = "grpl";
  }
};
var j2kHBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "J2KHeaderInfoBox";
  }
  static {
    this.fourcc = "j2kH";
  }
};
var etypBox = class extends ContainerBox {
  constructor() {
    super(...arguments);
    this.box_name = "ExtendedTypeBox";
    this.tycos = [];
    this.subBoxNames = ["tyco"];
  }
  static {
    this.fourcc = "etyp";
  }
};

// src/boxes/dref.ts
var drefBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "DataReferenceBox";
  }
  static {
    this.fourcc = "dref";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.entries = [];
    const entry_count = stream.readUint32();
    for (let i = 0; i < entry_count; i++) {
      const ret = parseOneBox(stream, false, this.size - (stream.getPosition() - this.start));
      if (ret.code === OK) {
        const box = ret.box;
        this.entries.push(box);
      } else {
        return;
      }
    }
  }
  /** @bundle writing/dref.js */
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4;
    this.writeHeader(stream);
    stream.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].write(stream);
      this.size += this.entries[i].size;
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream.adjustUint32(this.sizePosition, this.size);
  }
};

// src/boxes/elng.ts
var elngBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ExtendedLanguageBox";
  }
  static {
    this.fourcc = "elng";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.extended_language = stream.readString(this.size - this.hdr_size);
  }
  /** @bundle writing/elng.js */
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = this.extended_language.length;
    this.writeHeader(stream);
    stream.writeString(this.extended_language);
  }
};

// src/boxes/ftyp.ts
var ftypBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "FileTypeBox";
  }
  static {
    this.fourcc = "ftyp";
  }
  parse(stream) {
    let toparse = this.size - this.hdr_size;
    this.major_brand = stream.readString(4);
    this.minor_version = stream.readUint32();
    toparse -= 8;
    this.compatible_brands = [];
    let i = 0;
    while (toparse >= 4) {
      this.compatible_brands[i] = stream.readString(4);
      toparse -= 4;
      i++;
    }
  }
  /** @bundle writing/ftyp.js */
  write(stream) {
    this.size = 8 + 4 * this.compatible_brands.length;
    this.writeHeader(stream);
    stream.writeString(this.major_brand, null, 4);
    stream.writeUint32(this.minor_version);
    for (let i = 0; i < this.compatible_brands.length; i++) {
      stream.writeString(this.compatible_brands[i], null, 4);
    }
  }
};

// src/boxes/hdlr.ts
var hdlrBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "HandlerBox";
  }
  static {
    this.fourcc = "hdlr";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 0) {
      stream.readUint32();
      this.handler = stream.readString(4);
      stream.readUint32Array(3);
      if (!this.isEndOfBox(stream)) {
        this.name = stream.readCString();
      }
    }
  }
  /** @bundle writing/hldr.js */
  write(stream) {
    this.size = 5 * 4 + this.name.length + 1;
    this.version = 0;
    this.flags = 0;
    this.writeHeader(stream);
    stream.writeUint32(0);
    stream.writeString(this.handler, null, 4);
    stream.writeUint32Array([0, 0, 0]);
    stream.writeCString(this.name);
  }
};

// src/boxes/hvcC.ts
var hvcCBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "HEVCConfigurationBox";
  }
  static {
    this.fourcc = "hvcC";
  }
  parse(stream) {
    this.configurationVersion = stream.readUint8();
    let tmp_byte = stream.readUint8();
    this.general_profile_space = tmp_byte >> 6;
    this.general_tier_flag = (tmp_byte & 32) >> 5;
    this.general_profile_idc = tmp_byte & 31;
    this.general_profile_compatibility = stream.readUint32();
    this.general_constraint_indicator = stream.readUint8Array(6);
    this.general_level_idc = stream.readUint8();
    this.min_spatial_segmentation_idc = stream.readUint16() & 4095;
    this.parallelismType = stream.readUint8() & 3;
    this.chroma_format_idc = stream.readUint8() & 3;
    this.bit_depth_luma_minus8 = stream.readUint8() & 7;
    this.bit_depth_chroma_minus8 = stream.readUint8() & 7;
    this.avgFrameRate = stream.readUint16();
    tmp_byte = stream.readUint8();
    this.constantFrameRate = tmp_byte >> 6;
    this.numTemporalLayers = (tmp_byte & 13) >> 3;
    this.temporalIdNested = (tmp_byte & 4) >> 2;
    this.lengthSizeMinusOne = tmp_byte & 3;
    this.nalu_arrays = [];
    const numOfArrays = stream.readUint8();
    for (let i = 0; i < numOfArrays; i++) {
      const nalu_array = [];
      this.nalu_arrays.push(nalu_array);
      tmp_byte = stream.readUint8();
      nalu_array.completeness = (tmp_byte & 128) >> 7;
      nalu_array.nalu_type = tmp_byte & 63;
      const numNalus = stream.readUint16();
      for (let j = 0; j < numNalus; j++) {
        const length = stream.readUint16();
        nalu_array.push({
          data: stream.readUint8Array(length)
        });
      }
    }
  }
  /** @bundle writing/write.js */
  write(stream) {
    this.size = 23;
    for (let i = 0; i < this.nalu_arrays.length; i++) {
      this.size += 3;
      for (let j = 0; j < this.nalu_arrays[i].length; j++) {
        this.size += 2 + this.nalu_arrays[i][j].data.length;
      }
    }
    this.writeHeader(stream);
    stream.writeUint8(this.configurationVersion);
    stream.writeUint8(
      (this.general_profile_space << 6) + (this.general_tier_flag << 5) + this.general_profile_idc
    );
    stream.writeUint32(this.general_profile_compatibility);
    stream.writeUint8Array(this.general_constraint_indicator);
    stream.writeUint8(this.general_level_idc);
    stream.writeUint16(this.min_spatial_segmentation_idc + (15 << 24));
    stream.writeUint8(this.parallelismType + (63 << 2));
    stream.writeUint8(this.chroma_format_idc + (63 << 2));
    stream.writeUint8(this.bit_depth_luma_minus8 + (31 << 3));
    stream.writeUint8(this.bit_depth_chroma_minus8 + (31 << 3));
    stream.writeUint16(this.avgFrameRate);
    stream.writeUint8(
      (this.constantFrameRate << 6) + (this.numTemporalLayers << 3) + (this.temporalIdNested << 2) + this.lengthSizeMinusOne
    );
    stream.writeUint8(this.nalu_arrays.length);
    for (let i = 0; i < this.nalu_arrays.length; i++) {
      stream.writeUint8((this.nalu_arrays[i].completeness << 7) + this.nalu_arrays[i].nalu_type);
      stream.writeUint16(this.nalu_arrays[i].length);
      for (let j = 0; j < this.nalu_arrays[i].length; j++) {
        stream.writeUint16(this.nalu_arrays[i][j].data.length);
        stream.writeUint8Array(this.nalu_arrays[i][j].data);
      }
    }
  }
};

// src/boxes/mdhd.ts
var mdhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "MediaHeaderBox";
  }
  static {
    this.fourcc = "mdhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 1) {
      this.creation_time = stream.readUint64();
      this.modification_time = stream.readUint64();
      this.timescale = stream.readUint32();
      this.duration = stream.readUint64();
    } else {
      this.creation_time = stream.readUint32();
      this.modification_time = stream.readUint32();
      this.timescale = stream.readUint32();
      this.duration = stream.readUint32();
    }
    this.parseLanguage(stream);
    stream.readUint16();
  }
  /** @bundle writing/mdhd.js */
  write(stream) {
    const useVersion1 = this.modification_time > MAX_SIZE || this.creation_time > MAX_SIZE || this.duration > MAX_SIZE || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4 * 4 + 2 * 2;
    this.size += useVersion1 ? 3 * 4 : 0;
    this.flags = 0;
    this.writeHeader(stream);
    if (useVersion1) {
      stream.writeUint64(this.creation_time);
      stream.writeUint64(this.modification_time);
      stream.writeUint32(this.timescale);
      stream.writeUint64(this.duration);
    } else {
      stream.writeUint32(this.creation_time);
      stream.writeUint32(this.modification_time);
      stream.writeUint32(this.timescale);
      stream.writeUint32(this.duration);
    }
    stream.writeUint16(this.language);
    stream.writeUint16(0);
  }
};

// src/boxes/mehd.ts
var mehdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieExtendsHeaderBox";
  }
  static {
    this.fourcc = "mehd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.flags & 1) {
      Log.warn("BoxParser", "mehd box incorrectly uses flags set to 1, converting version to 1");
      this.version = 1;
    }
    if (this.version === 1) {
      this.fragment_duration = stream.readUint64();
    } else {
      this.fragment_duration = stream.readUint32();
    }
  }
  /** @bundle writing/mehd.js */
  write(stream) {
    const useVersion1 = this.fragment_duration > MAX_SIZE || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4;
    this.size += useVersion1 ? 4 : 0;
    this.flags = 0;
    this.writeHeader(stream);
    if (useVersion1) {
      stream.writeUint64(this.fragment_duration);
    } else {
      stream.writeUint32(this.fragment_duration);
    }
  }
};

// src/boxes/infe.ts
var infeBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemInfoEntry";
  }
  static {
    this.fourcc = "infe";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 0 || this.version === 1) {
      this.item_ID = stream.readUint16();
      this.item_protection_index = stream.readUint16();
      this.item_name = stream.readCString();
      this.content_type = stream.readCString();
      if (!this.isEndOfBox(stream)) {
        this.content_encoding = stream.readCString();
      }
    }
    if (this.version === 1) {
      this.extension_type = stream.readString(4);
      Log.warn("BoxParser", "Cannot parse extension type");
      stream.seek(this.start + this.size);
      return;
    }
    if (this.version >= 2) {
      if (this.version === 2) {
        this.item_ID = stream.readUint16();
      } else if (this.version === 3) {
        this.item_ID = stream.readUint32();
      }
      this.item_protection_index = stream.readUint16();
      this.item_type = stream.readString(4);
      this.item_name = stream.readCString();
      if (this.item_type === "mime") {
        this.content_type = stream.readCString();
        this.content_encoding = stream.readCString();
      } else if (this.item_type === "uri ") {
        this.item_uri_type = stream.readCString();
      }
    }
  }
};

// src/boxes/iinf.ts
var iinfBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemInfoBox";
  }
  static {
    this.fourcc = "iinf";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 0) {
      this.entry_count = stream.readUint16();
    } else {
      this.entry_count = stream.readUint32();
    }
    this.item_infos = [];
    for (let i = 0; i < this.entry_count; i++) {
      const ret = parseOneBox(stream, false, this.size - (stream.getPosition() - this.start));
      if (ret.code === OK) {
        const box = ret.box;
        if (box.type === "infe") {
          this.item_infos[i] = box;
        } else {
          Log.error("BoxParser", "Expected 'infe' box, got " + ret.box.type, stream.isofile);
        }
      } else {
        return;
      }
    }
  }
};

// src/boxes/iloc.ts
var ilocBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemLocationBox";
  }
  static {
    this.fourcc = "iloc";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    let byte;
    byte = stream.readUint8();
    this.offset_size = byte >> 4 & 15;
    this.length_size = byte & 15;
    byte = stream.readUint8();
    this.base_offset_size = byte >> 4 & 15;
    if (this.version === 1 || this.version === 2) {
      this.index_size = byte & 15;
    } else {
      this.index_size = 0;
    }
    this.items = [];
    let item_count = 0;
    if (this.version < 2) {
      item_count = stream.readUint16();
    } else if (this.version === 2) {
      item_count = stream.readUint32();
    } else {
      throw new Error("version of iloc box not supported");
    }
    for (let i = 0; i < item_count; i++) {
      let item_ID = 0;
      let construction_method = 0;
      let base_offset = 0;
      if (this.version < 2) {
        item_ID = stream.readUint16();
      } else if (this.version === 2) {
        item_ID = stream.readUint32();
      } else {
        throw new Error("version of iloc box not supported");
      }
      if (this.version === 1 || this.version === 2) {
        construction_method = stream.readUint16() & 15;
      } else {
        construction_method = 0;
      }
      const data_reference_index = stream.readUint16();
      switch (this.base_offset_size) {
        case 0:
          base_offset = 0;
          break;
        case 4:
          base_offset = stream.readUint32();
          break;
        case 8:
          base_offset = stream.readUint64();
          break;
        default:
          throw new Error("Error reading base offset size");
      }
      const extents = [];
      const extent_count = stream.readUint16();
      for (let j = 0; j < extent_count; j++) {
        let extent_index = 0;
        let extent_offset = 0;
        let extent_length = 0;
        if (this.version === 1 || this.version === 2) {
          switch (this.index_size) {
            case 0:
              extent_index = 0;
              break;
            case 4:
              extent_index = stream.readUint32();
              break;
            case 8:
              extent_index = stream.readUint64();
              break;
            default:
              throw new Error("Error reading extent index");
          }
        }
        switch (this.offset_size) {
          case 0:
            extent_offset = 0;
            break;
          case 4:
            extent_offset = stream.readUint32();
            break;
          case 8:
            extent_offset = stream.readUint64();
            break;
          default:
            throw new Error("Error reading extent index");
        }
        switch (this.length_size) {
          case 0:
            extent_length = 0;
            break;
          case 4:
            extent_length = stream.readUint32();
            break;
          case 8:
            extent_length = stream.readUint64();
            break;
          default:
            throw new Error("Error reading extent index");
        }
        extents.push({ extent_index, extent_length, extent_offset });
      }
      this.items.push({
        base_offset,
        construction_method,
        item_ID,
        data_reference_index,
        extents
      });
    }
  }
};

// src/boxes/iref.ts
var REFERENCE_TYPE_NAMES = {
  auxl: "Auxiliary image item",
  base: "Pre-derived image item base",
  cdsc: "Item describes referenced item",
  dimg: "Derived image item",
  dpnd: "Item coding dependency",
  eroi: "Region",
  evir: "EVC slice",
  exbl: "Scalable image item",
  "fdl ": "File delivery",
  font: "Font item",
  iloc: "Item data location",
  mask: "Region mask",
  mint: "Data integrity",
  pred: "Predictively coded item",
  prem: "Pre-multiplied item",
  tbas: "HEVC tile track base item",
  thmb: "Thumbnail image item"
};
var irefBox = class _irefBox extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ItemReferenceBox";
    this.references = [];
  }
  static {
    this.fourcc = "iref";
  }
  static {
    this.allowed_types = [
      "auxl",
      "base",
      "cdsc",
      "dimg",
      "dpnd",
      "eroi",
      "evir",
      "exbl",
      "fdl ",
      "font",
      "iloc",
      "mask",
      "mint",
      "pred",
      "prem",
      "tbas",
      "thmb"
    ];
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.references = [];
    while (stream.getPosition() < this.start + this.size) {
      const ret = parseOneBox(stream, true, this.size - (stream.getPosition() - this.start));
      if (ret.code === OK) {
        let name = "Unknown item reference";
        if (!_irefBox.allowed_types.includes(ret.type)) {
          Log.warn("BoxParser", `Unknown item reference type: '${ret.type}'`);
        } else name = REFERENCE_TYPE_NAMES[ret.type];
        const box = this.version === 0 ? new SingleItemTypeReferenceBox(ret.type, ret.size, name, ret.hdr_size, ret.start) : new SingleItemTypeReferenceBoxLarge(
          ret.type,
          ret.size,
          name,
          ret.hdr_size,
          ret.start
        );
        if (box.write === Box.prototype.write && box.type !== "mdat") {
          Log.warn(
            "BoxParser",
            box.type + " box writing not yet implemented, keeping unparsed data in memory for later write"
          );
          box.parseDataAndRewind(stream);
        }
        box.parse(stream);
        this.references.push(box);
      } else {
        return;
      }
    }
  }
};

// src/boxes/pitm.ts
var pitmBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "PrimaryItemBox";
  }
  static {
    this.fourcc = "pitm";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 0) {
      this.item_id = stream.readUint16();
    } else {
      this.item_id = stream.readUint32();
    }
  }
};

// src/boxes/meta.ts
var metaBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "MetaBox";
  }
  static {
    this.fourcc = "meta";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.boxes = [];
    ContainerBox.prototype.parse.call(this, stream);
  }
};

// src/boxes/mfhd.ts
var mfhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieFragmentHeaderBox";
  }
  static {
    this.fourcc = "mfhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.sequence_number = stream.readUint32();
  }
  /** @bundle writing/mfhd.js */
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4;
    this.writeHeader(stream);
    stream.writeUint32(this.sequence_number);
  }
};

// src/boxes/mvhd.ts
var mvhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "MovieHeaderBox";
  }
  static {
    this.fourcc = "mvhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 1) {
      this.creation_time = stream.readUint64();
      this.modification_time = stream.readUint64();
      this.timescale = stream.readUint32();
      this.duration = stream.readUint64();
    } else {
      this.creation_time = stream.readUint32();
      this.modification_time = stream.readUint32();
      this.timescale = stream.readUint32();
      this.duration = stream.readUint32();
    }
    this.rate = stream.readUint32();
    this.volume = stream.readUint16() >> 8;
    stream.readUint16();
    stream.readUint32Array(2);
    this.matrix = stream.readUint32Array(9);
    stream.readUint32Array(6);
    this.next_track_id = stream.readUint32();
  }
  /** @bundle writing/mvhd.js */
  write(stream) {
    const useVersion1 = this.modification_time > MAX_SIZE || this.creation_time > MAX_SIZE || this.duration > MAX_SIZE || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4 * 4 + 20 * 4;
    this.size += useVersion1 ? 3 * 4 : 0;
    this.flags = 0;
    this.writeHeader(stream);
    if (useVersion1) {
      stream.writeUint64(this.creation_time);
      stream.writeUint64(this.modification_time);
      stream.writeUint32(this.timescale);
      stream.writeUint64(this.duration);
    } else {
      stream.writeUint32(this.creation_time);
      stream.writeUint32(this.modification_time);
      stream.writeUint32(this.timescale);
      stream.writeUint32(this.duration);
    }
    stream.writeUint32(this.rate);
    stream.writeUint16(this.volume << 8);
    stream.writeUint16(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32Array(this.matrix);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32(0);
    stream.writeUint32(this.next_track_id);
  }
  /** @bundle box-print.js */
  print(output) {
    super.printHeader(output);
    output.log(output.indent + "creation_time: " + this.creation_time);
    output.log(output.indent + "modification_time: " + this.modification_time);
    output.log(output.indent + "timescale: " + this.timescale);
    output.log(output.indent + "duration: " + this.duration);
    output.log(output.indent + "rate: " + this.rate);
    output.log(output.indent + "volume: " + (this.volume >> 8));
    output.log(output.indent + "matrix: " + this.matrix.join(", "));
    output.log(output.indent + "next_track_id: " + this.next_track_id);
  }
};

// src/boxes/sampleentries/mett.ts
var mettSampleEntry = class extends MetadataSampleEntry {
  static {
    this.fourcc = "mett";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.content_encoding = stream.readCString();
    this.mime_format = stream.readCString();
    this.parseFooter(stream);
  }
};

// src/boxes/sampleentries/metx.ts
var metxSampleEntry = class extends MetadataSampleEntry {
  static {
    this.fourcc = "metx";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.content_encoding = stream.readCString();
    this.namespace = stream.readCString();
    this.schema_location = stream.readCString();
    this.parseFooter(stream);
  }
};

// src/boxes/av1C.ts
var av1CBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "AV1CodecConfigurationBox";
  }
  static {
    this.fourcc = "av1C";
  }
  parse(stream) {
    let tmp = stream.readUint8();
    if ((tmp >> 7 & 1) !== 1) {
      Log.error("BoxParser", "av1C marker problem", stream.isofile);
      return;
    }
    this.version = tmp & 127;
    if (this.version !== 1) {
      Log.error("BoxParser", "av1C version " + this.version + " not supported", stream.isofile);
      return;
    }
    tmp = stream.readUint8();
    this.seq_profile = tmp >> 5 & 7;
    this.seq_level_idx_0 = tmp & 31;
    tmp = stream.readUint8();
    this.seq_tier_0 = tmp >> 7 & 1;
    this.high_bitdepth = tmp >> 6 & 1;
    this.twelve_bit = tmp >> 5 & 1;
    this.monochrome = tmp >> 4 & 1;
    this.chroma_subsampling_x = tmp >> 3 & 1;
    this.chroma_subsampling_y = tmp >> 2 & 1;
    this.chroma_sample_position = tmp & 3;
    tmp = stream.readUint8();
    this.reserved_1 = tmp >> 5 & 7;
    if (this.reserved_1 !== 0) {
      Log.error("BoxParser", "av1C reserved_1 parsing problem", stream.isofile);
      return;
    }
    this.initial_presentation_delay_present = tmp >> 4 & 1;
    if (this.initial_presentation_delay_present === 1) {
      this.initial_presentation_delay_minus_one = tmp & 15;
    } else {
      this.reserved_2 = tmp & 15;
      if (this.reserved_2 !== 0) {
        Log.error("BoxParser", "av1C reserved_2 parsing problem", stream.isofile);
        return;
      }
    }
    const configOBUs_length = this.size - this.hdr_size - 4;
    this.configOBUs = stream.readUint8Array(configOBUs_length);
  }
};

// src/boxes/esds.ts
var esdsBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ElementaryStreamDescriptorBox";
  }
  static {
    this.fourcc = "esds";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    const esd_data = stream.readUint8Array(this.size - this.hdr_size);
    if ("MPEG4DescriptorParser" in DescriptorRegistry) {
      const esd_parser = new DescriptorRegistry.MPEG4DescriptorParser();
      this.esd = esd_parser.parseOneDescriptor(
        new DataStream(esd_data.buffer, 0, 1 /* BIG_ENDIAN */)
      );
    }
  }
};

// src/boxes/vpcC.ts
var vpcCBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "VPCodecConfigurationRecord";
  }
  static {
    this.fourcc = "vpcC";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 1) {
      this.profile = stream.readUint8();
      this.level = stream.readUint8();
      const tmp = stream.readUint8();
      this.bitDepth = tmp >> 4;
      this.chromaSubsampling = tmp >> 1 & 7;
      this.videoFullRangeFlag = tmp & 1;
      this.colourPrimaries = stream.readUint8();
      this.transferCharacteristics = stream.readUint8();
      this.matrixCoefficients = stream.readUint8();
      this.codecIntializationDataSize = stream.readUint16();
      this.codecIntializationData = stream.readUint8Array(this.codecIntializationDataSize);
    } else {
      this.profile = stream.readUint8();
      this.level = stream.readUint8();
      let tmp = stream.readUint8();
      this.bitDepth = tmp >> 4 & 15;
      this.colorSpace = tmp & 15;
      tmp = stream.readUint8();
      this.chromaSubsampling = tmp >> 4 & 15;
      this.transferFunction = tmp >> 1 & 7;
      this.videoFullRangeFlag = tmp & 1;
      this.codecIntializationDataSize = stream.readUint16();
      this.codecIntializationData = stream.readUint8Array(this.codecIntializationDataSize);
    }
  }
};

// src/boxes/vvcC.ts
var vvcCBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "VvcConfigurationBox";
  }
  static {
    this.fourcc = "vvcC";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    const bitReader = {
      held_bits: void 0,
      num_held_bits: 0,
      stream_read_1_bytes: function(strm) {
        this.held_bits = strm.readUint8();
        this.num_held_bits = 1 * 8;
      },
      stream_read_2_bytes: function(strm) {
        this.held_bits = strm.readUint16();
        this.num_held_bits = 2 * 8;
      },
      extract_bits: function(num_bits) {
        const ret = this.held_bits >> this.num_held_bits - num_bits & (1 << num_bits) - 1;
        this.num_held_bits -= num_bits;
        return ret;
      }
    };
    bitReader.stream_read_1_bytes(stream);
    bitReader.extract_bits(5);
    this.lengthSizeMinusOne = bitReader.extract_bits(2);
    this.ptl_present_flag = bitReader.extract_bits(1);
    if (this.ptl_present_flag) {
      bitReader.stream_read_2_bytes(stream);
      this.ols_idx = bitReader.extract_bits(9);
      this.num_sublayers = bitReader.extract_bits(3);
      this.constant_frame_rate = bitReader.extract_bits(2);
      this.chroma_format_idc = bitReader.extract_bits(2);
      bitReader.stream_read_1_bytes(stream);
      this.bit_depth_minus8 = bitReader.extract_bits(3);
      bitReader.extract_bits(5);
      {
        bitReader.stream_read_2_bytes(stream);
        bitReader.extract_bits(2);
        this.num_bytes_constraint_info = bitReader.extract_bits(6);
        this.general_profile_idc = bitReader.extract_bits(7);
        this.general_tier_flag = bitReader.extract_bits(1);
        this.general_level_idc = stream.readUint8();
        bitReader.stream_read_1_bytes(stream);
        this.ptl_frame_only_constraint_flag = bitReader.extract_bits(1);
        this.ptl_multilayer_enabled_flag = bitReader.extract_bits(1);
        this.general_constraint_info = new Uint8Array(this.num_bytes_constraint_info);
        if (this.num_bytes_constraint_info) {
          for (let i = 0; i < this.num_bytes_constraint_info - 1; i++) {
            const cnstr1 = bitReader.extract_bits(6);
            bitReader.stream_read_1_bytes(stream);
            const cnstr2 = bitReader.extract_bits(2);
            this.general_constraint_info[i] = cnstr1 << 2 | cnstr2;
          }
          this.general_constraint_info[this.num_bytes_constraint_info - 1] = bitReader.extract_bits(6);
        } else {
          bitReader.extract_bits(6);
        }
        if (this.num_sublayers > 1) {
          bitReader.stream_read_1_bytes(stream);
          this.ptl_sublayer_present_mask = 0;
          for (let j = this.num_sublayers - 2; j >= 0; --j) {
            const val = bitReader.extract_bits(1);
            this.ptl_sublayer_present_mask |= val << j;
          }
          for (let j = this.num_sublayers; j <= 8 && this.num_sublayers > 1; ++j) {
            bitReader.extract_bits(1);
          }
          this.sublayer_level_idc = [];
          for (let j = this.num_sublayers - 2; j >= 0; --j) {
            if (this.ptl_sublayer_present_mask & 1 << j) {
              this.sublayer_level_idc[j] = stream.readUint8();
            }
          }
        }
        this.ptl_num_sub_profiles = stream.readUint8();
        this.general_sub_profile_idc = [];
        if (this.ptl_num_sub_profiles) {
          for (let i = 0; i < this.ptl_num_sub_profiles; i++) {
            this.general_sub_profile_idc.push(stream.readUint32());
          }
        }
      }
      this.max_picture_width = stream.readUint16();
      this.max_picture_height = stream.readUint16();
      this.avg_frame_rate = stream.readUint16();
    }
    const VVC_NALU_OPI = 12;
    const VVC_NALU_DEC_PARAM = 13;
    this.nalu_arrays = [];
    const num_of_arrays = stream.readUint8();
    for (let i = 0; i < num_of_arrays; i++) {
      const nalu_array = [];
      this.nalu_arrays.push(nalu_array);
      bitReader.stream_read_1_bytes(stream);
      nalu_array.completeness = bitReader.extract_bits(1);
      bitReader.extract_bits(2);
      nalu_array.nalu_type = bitReader.extract_bits(5);
      let numNalus = 1;
      if (nalu_array.nalu_type !== VVC_NALU_DEC_PARAM && nalu_array.nalu_type !== VVC_NALU_OPI) {
        numNalus = stream.readUint16();
      }
      for (let j = 0; j < numNalus; j++) {
        const len = stream.readUint16();
        nalu_array.push({
          data: stream.readUint8Array(len),
          length: len
        });
      }
    }
  }
};

// src/boxes/colr.ts
var colrBox = class extends Box {
  constructor() {
    super(...arguments);
    this.box_name = "ColourInformationBox";
  }
  static {
    this.fourcc = "colr";
  }
  parse(stream) {
    this.colour_type = stream.readString(4);
    if (this.colour_type === "nclx") {
      this.colour_primaries = stream.readUint16();
      this.transfer_characteristics = stream.readUint16();
      this.matrix_coefficients = stream.readUint16();
      const tmp = stream.readUint8();
      this.full_range_flag = tmp >> 7;
    } else if (this.colour_type === "rICC") {
      this.ICC_profile = stream.readUint8Array(this.size - 4);
    } else if (this.colour_type === "prof") {
      this.ICC_profile = stream.readUint8Array(this.size - 4);
    }
  }
};

// src/boxes/sampleentries/sampleentry.ts
function decimalToHex(d, padding) {
  let hex = Number(d).toString(16);
  padding = typeof padding === "undefined" || padding === null ? padding = 2 : padding;
  while (hex.length < padding) {
    hex = "0" + hex;
  }
  return hex;
}
var avcCSampleEntryBase = class extends VisualSampleEntry {
  /** @bundle box-codecs.js */
  getCodec() {
    const baseCodec = super.getCodec();
    if (this.avcC) {
      return `${baseCodec}.${decimalToHex(this.avcC.AVCProfileIndication)}${decimalToHex(
        this.avcC.profile_compatibility
      )}${decimalToHex(this.avcC.AVCLevelIndication)}`;
    } else {
      return baseCodec;
    }
  }
};
var avc1SampleEntry = class extends avcCSampleEntryBase {
  static {
    this.fourcc = "avc1";
  }
};
var avc2SampleEntry = class extends avcCSampleEntryBase {
  static {
    this.fourcc = "avc2";
  }
};
var avc3SampleEntry = class extends avcCSampleEntryBase {
  static {
    this.fourcc = "avc3";
  }
};
var avc4SampleEntry = class extends avcCSampleEntryBase {
  static {
    this.fourcc = "avc4";
  }
};
var av01SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "av01";
  }
  /** @bundle box-codecs.js */
  getCodec() {
    const baseCodec = super.getCodec();
    const level_idx_0 = this.av1C.seq_level_idx_0;
    const level = level_idx_0 < 10 ? "0" + level_idx_0 : level_idx_0;
    let bitdepth;
    if (this.av1C.seq_profile === 2 && this.av1C.high_bitdepth === 1) {
      bitdepth = this.av1C.twelve_bit === 1 ? "12" : "10";
    } else if (this.av1C.seq_profile <= 2) {
      bitdepth = this.av1C.high_bitdepth === 1 ? "10" : "08";
    }
    return baseCodec + "." + this.av1C.seq_profile + "." + level + (this.av1C.seq_tier_0 ? "H" : "M") + "." + bitdepth;
  }
};
var dav1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "dav1";
  }
};
var hvcCSampleEntryBase = class extends VisualSampleEntry {
  /** @bundle box-codecs.js */
  getCodec() {
    let baseCodec = super.getCodec();
    if (this.hvcC) {
      baseCodec += ".";
      switch (this.hvcC.general_profile_space) {
        case 0:
          baseCodec += "";
          break;
        case 1:
          baseCodec += "A";
          break;
        case 2:
          baseCodec += "B";
          break;
        case 3:
          baseCodec += "C";
          break;
      }
      baseCodec += this.hvcC.general_profile_idc;
      baseCodec += ".";
      let val = this.hvcC.general_profile_compatibility;
      let reversed = 0;
      for (let i = 0; i < 32; i++) {
        reversed |= val & 1;
        if (i === 31) break;
        reversed <<= 1;
        val >>= 1;
      }
      baseCodec += decimalToHex(reversed, 0);
      baseCodec += ".";
      if (this.hvcC.general_tier_flag === 0) {
        baseCodec += "L";
      } else {
        baseCodec += "H";
      }
      baseCodec += this.hvcC.general_level_idc;
      let hasByte = false;
      let constraint_string = "";
      for (let i = 5; i >= 0; i--) {
        if (this.hvcC.general_constraint_indicator[i] || hasByte) {
          constraint_string = "." + decimalToHex(this.hvcC.general_constraint_indicator[i], 0) + constraint_string;
          hasByte = true;
        }
      }
      baseCodec += constraint_string;
    }
    return baseCodec;
  }
};
var hvc1SampleEntry = class extends hvcCSampleEntryBase {
  static {
    this.fourcc = "hvc1";
  }
};
var hvc2SampleEntry = class extends hvcCSampleEntryBase {
  static {
    this.fourcc = "hvc2";
  }
};
var hev1SampleEntry = class extends hvcCSampleEntryBase {
  constructor() {
    super(...arguments);
    this.colrs = [];
    this.subBoxNames = ["colr"];
  }
  static {
    this.fourcc = "hev1";
  }
};
var hev2SampleEntry = class extends hvcCSampleEntryBase {
  static {
    this.fourcc = "hev2";
  }
};
var hvt1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "hvt1";
  }
};
var lhe1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "lhe1";
  }
};
var lhv1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "lhv1";
  }
};
var dvh1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "dvh1";
  }
};
var dvheSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "dvhe";
  }
};
var vvcCSampleEntryBase = class extends VisualSampleEntry {
  getCodec() {
    let baseCodec = super.getCodec();
    if (this.vvcC) {
      baseCodec += "." + this.vvcC.general_profile_idc;
      if (this.vvcC.general_tier_flag) {
        baseCodec += ".H";
      } else {
        baseCodec += ".L";
      }
      baseCodec += this.vvcC.general_level_idc;
      let constraint_string = "";
      if (this.vvcC.general_constraint_info) {
        const bytes = [];
        let byte = 0;
        byte |= this.vvcC.ptl_frame_only_constraint_flag << 7;
        byte |= this.vvcC.ptl_multilayer_enabled_flag << 6;
        let last_nonzero = void 0;
        for (let i = 0; i < this.vvcC.general_constraint_info.length; ++i) {
          byte |= this.vvcC.general_constraint_info[i] >> 2 & 63;
          bytes.push(byte);
          if (byte) {
            last_nonzero = i;
          }
          byte = this.vvcC.general_constraint_info[i] >> 2 & 3;
        }
        if (last_nonzero === void 0) {
          constraint_string = ".CA";
        } else {
          constraint_string = ".C";
          const base32_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          let held_bits = 0;
          let num_held_bits = 0;
          for (let i = 0; i <= last_nonzero; ++i) {
            held_bits = held_bits << 8 | bytes[i];
            num_held_bits += 8;
            while (num_held_bits >= 5) {
              const val = held_bits >> num_held_bits - 5 & 31;
              constraint_string += base32_chars[val];
              num_held_bits -= 5;
              held_bits &= (1 << num_held_bits) - 1;
            }
          }
          if (num_held_bits) {
            held_bits <<= 5 - num_held_bits;
            constraint_string += base32_chars[held_bits & 31];
          }
        }
      }
      baseCodec += constraint_string;
    }
    return baseCodec;
  }
};
var vvc1SampleEntry = class extends vvcCSampleEntryBase {
  static {
    this.fourcc = "vvc1";
  }
};
var vvi1SampleEntry = class extends vvcCSampleEntryBase {
  static {
    this.fourcc = "vvi1";
  }
};
var vvs1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "vvs1";
  }
};
var vvcNSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "vvcN";
  }
};
var vpcCSampleEntryBase = class extends VisualSampleEntry {
  getCodec() {
    const baseCodec = super.getCodec();
    let level = this.vpcC.level;
    if (level === 0) {
      level = "00";
    }
    let bitDepth = this.vpcC.bitDepth;
    if (bitDepth === 8) {
      bitDepth = "08";
    }
    return `${baseCodec}.0${this.vpcC.profile}.${level}.${bitDepth}`;
  }
};
var vp08SampleEntry = class extends vpcCSampleEntryBase {
  static {
    this.fourcc = "vp08";
  }
};
var vp09SampleEntry = class extends vpcCSampleEntryBase {
  static {
    this.fourcc = "vp09";
  }
};
var avs3SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "avs3";
  }
};
var j2kiSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "j2ki";
  }
};
var mjp2SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "mjp2";
  }
};
var mjpgSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "mjpg";
  }
};
var uncvSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "uncv";
  }
};
var mp4vSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "mp4v";
  }
};
var mp4aSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mp4a";
  }
  getCodec() {
    const baseCodec = super.getCodec();
    if (this.esds && this.esds.esd) {
      const oti = this.esds.esd.getOTI();
      const dsi = this.esds.esd.getAudioConfig();
      return baseCodec + "." + decimalToHex(oti) + (dsi ? "." + dsi : "");
    } else {
      return baseCodec;
    }
  }
};
var m4aeSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "m4ae";
  }
};
var ac_3SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "ac-3";
  }
};
var ac_4SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "ac-4";
  }
};
var ec_3SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "ec-3";
  }
};
var OpusSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "Opus";
  }
};
var mha1SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mha1";
  }
};
var mha2SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mha2";
  }
};
var mhm1SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mhm1";
  }
};
var mhm2SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mhm2";
  }
};
var fLaCSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "fLaC";
  }
};
var encvSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "encv";
  }
};
var encaSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "enca";
  }
};
var encuSampleEntry = class extends SubtitleSampleEntry {
  constructor() {
    super(...arguments);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "encu";
  }
};
var encsSampleEntry = class extends SystemSampleEntry {
  constructor() {
    super(...arguments);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "encs";
  }
};
var mp4sSampleEntry = class extends SystemSampleEntry {
  static {
    this.fourcc = "mp4s";
  }
};
var enctSampleEntry = class extends TextSampleEntry {
  constructor() {
    super(...arguments);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "enct";
  }
};
var encmSampleEntry = class extends MetadataSampleEntry {
  constructor() {
    super(...arguments);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "encm";
  }
};
var resvSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "resv";
  }
};

// src/boxes/sampleentries/sbtt.ts
var sbttSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "sbtt";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.content_encoding = stream.readCString();
    this.mime_format = stream.readCString();
    this.parseFooter(stream);
  }
};

// src/boxes/sampleentries/stpp.ts
var stppSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "stpp";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.namespace = stream.readCString();
    this.schema_location = stream.readCString();
    this.auxiliary_mime_types = stream.readCString();
    this.parseFooter(stream);
  }
  /** @bundle writing/sampleentry.js */
  write(stream) {
    this.writeHeader(stream);
    this.size += this.namespace.length + 1 + this.schema_location.length + 1 + this.auxiliary_mime_types.length + 1;
    stream.writeCString(this.namespace);
    stream.writeCString(this.schema_location);
    stream.writeCString(this.auxiliary_mime_types);
    this.writeFooter(stream);
  }
};

// src/boxes/sampleentries/stxt.ts
var stxtSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "stxt";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.content_encoding = stream.readCString();
    this.mime_format = stream.readCString();
    this.parseFooter(stream);
  }
  getCodec() {
    const baseCodec = super.getCodec();
    if (this.mime_format) {
      return baseCodec + "." + this.mime_format;
    } else {
      return baseCodec;
    }
  }
};

// src/boxes/sampleentries/tx3g.ts
var tx3gSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "tx3g";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.displayFlags = stream.readUint32();
    this.horizontal_justification = stream.readInt8();
    this.vertical_justification = stream.readInt8();
    this.bg_color_rgba = stream.readUint8Array(4);
    this.box_record = stream.readInt16Array(4);
    this.style_record = stream.readUint8Array(12);
    this.parseFooter(stream);
  }
};

// src/boxes/sampleentries/wvtt.ts
var wvttSampleEntry = class extends MetadataSampleEntry {
  static {
    this.fourcc = "wvtt";
  }
  parse(stream) {
    this.parseHeader(stream);
    this.parseFooter(stream);
  }
};

// src/boxes/sbgp.ts
var sbgpBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleToGroupBox";
  }
  static {
    this.fourcc = "sbgp";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.grouping_type = stream.readString(4);
    if (this.version === 1) {
      this.grouping_type_parameter = stream.readUint32();
    } else {
      this.grouping_type_parameter = 0;
    }
    this.entries = [];
    const entry_count = stream.readUint32();
    for (let i = 0; i < entry_count; i++) {
      this.entries.push({
        sample_count: stream.readInt32(),
        group_description_index: stream.readInt32()
      });
    }
  }
  /** @bundle writing/sbgp.js */
  write(stream) {
    if (this.grouping_type_parameter) this.version = 1;
    else this.version = 0;
    this.flags = 0;
    this.size = 8 + 8 * this.entries.length + (this.version === 1 ? 4 : 0);
    this.writeHeader(stream);
    stream.writeString(this.grouping_type, null, 4);
    if (this.version === 1) {
      stream.writeUint32(this.grouping_type_parameter);
    }
    stream.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      stream.writeInt32(entry.sample_count);
      stream.writeInt32(entry.group_description_index);
    }
  }
};

// src/boxes/sdtp.ts
var sdtpBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleDependencyTypeBox";
  }
  static {
    this.fourcc = "sdtp";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    const count = this.size - this.hdr_size;
    this.is_leading = [];
    this.sample_depends_on = [];
    this.sample_is_depended_on = [];
    this.sample_has_redundancy = [];
    for (let i = 0; i < count; i++) {
      const tmp_byte = stream.readUint8();
      this.is_leading[i] = tmp_byte >> 6;
      this.sample_depends_on[i] = tmp_byte >> 4 & 3;
      this.sample_is_depended_on[i] = tmp_byte >> 2 & 3;
      this.sample_has_redundancy[i] = tmp_byte & 3;
    }
  }
};

// src/boxes/sgpd.ts
var sgpdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleGroupDescriptionBox";
  }
  static {
    this.fourcc = "sgpd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.grouping_type = stream.readString(4);
    Log.debug("BoxParser", "Found Sample Groups of type " + this.grouping_type);
    if (this.version === 1) {
      this.default_length = stream.readUint32();
    } else {
      this.default_length = 0;
    }
    if (this.version >= 2) {
      this.default_group_description_index = stream.readUint32();
    }
    this.entries = [];
    const entry_count = stream.readUint32();
    for (let i = 0; i < entry_count; i++) {
      let entry;
      if (this.grouping_type in BoxRegistry.sampleGroupEntry) {
        entry = new BoxRegistry.sampleGroupEntry[this.grouping_type](this.grouping_type);
      } else {
        entry = new SampleGroupEntry(this.grouping_type);
      }
      this.entries.push(entry);
      if (this.version === 1) {
        if (this.default_length === 0) {
          entry.description_length = stream.readUint32();
        } else {
          entry.description_length = this.default_length;
        }
      } else {
        entry.description_length = this.default_length;
      }
      if (entry.write === SampleGroupEntry.prototype.write) {
        Log.info(
          "BoxParser",
          "SampleGroup for type " + this.grouping_type + " writing not yet implemented, keeping unparsed data in memory for later write"
        );
        entry.data = stream.readUint8Array(entry.description_length);
        stream.seek(stream.getPosition() - entry.description_length);
      }
      entry.parse(stream);
    }
  }
  /** @bundle writing/sgpd.js */
  write(stream) {
    this.flags = 0;
    this.size = 12;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (this.version === 1) {
        if (this.default_length === 0) {
          this.size += 4;
        }
        this.size += entry.data.length;
      }
    }
    this.writeHeader(stream);
    stream.writeString(this.grouping_type, null, 4);
    if (this.version === 1) {
      stream.writeUint32(this.default_length);
    }
    if (this.version >= 2) {
      stream.writeUint32(this.default_sample_description_index);
    }
    stream.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (this.version === 1) {
        if (this.default_length === 0) {
          stream.writeUint32(entry.description_length);
        }
      }
      entry.write(stream);
    }
  }
};

// src/boxes/sidx.ts
var sidxBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "CompressedSegmentIndexBox";
  }
  static {
    this.fourcc = "sidx";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.reference_ID = stream.readUint32();
    this.timescale = stream.readUint32();
    if (this.version === 0) {
      this.earliest_presentation_time = stream.readUint32();
      this.first_offset = stream.readUint32();
    } else {
      this.earliest_presentation_time = stream.readUint64();
      this.first_offset = stream.readUint64();
    }
    stream.readUint16();
    this.references = [];
    const count = stream.readUint16();
    for (let i = 0; i < count; i++) {
      const type = stream.readUint32();
      const subsegment_duration = stream.readUint32();
      const sap = stream.readUint32();
      this.references.push({
        reference_type: type >> 31 & 1,
        referenced_size: type & 2147483647,
        subsegment_duration,
        starts_with_SAP: sap >> 31 & 1,
        SAP_type: sap >> 28 & 7,
        SAP_delta_time: sap & 268435455
      });
    }
  }
  /** @bundle writing/sidx.js */
  write(stream) {
    const useVersion1 = this.earliest_presentation_time > MAX_SIZE || this.first_offset > MAX_SIZE || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4 * 2 + 2 + 2 + 12 * this.references.length;
    this.size += useVersion1 ? 16 : 8;
    this.flags = 0;
    this.writeHeader(stream);
    stream.writeUint32(this.reference_ID);
    stream.writeUint32(this.timescale);
    if (useVersion1) {
      stream.writeUint64(this.earliest_presentation_time);
      stream.writeUint64(this.first_offset);
    } else {
      stream.writeUint32(this.earliest_presentation_time);
      stream.writeUint32(this.first_offset);
    }
    stream.writeUint16(0);
    stream.writeUint16(this.references.length);
    for (let i = 0; i < this.references.length; i++) {
      const ref = this.references[i];
      stream.writeUint32(ref.reference_type << 31 | ref.referenced_size);
      stream.writeUint32(ref.subsegment_duration);
      stream.writeUint32(ref.starts_with_SAP << 31 | ref.SAP_type << 28 | ref.SAP_delta_time);
    }
  }
};

// src/boxes/smhd.ts
var smhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SoundMediaHeaderBox";
  }
  static {
    this.fourcc = "smhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.balance = stream.readUint16();
    stream.readUint16();
  }
  /** @bundle writing/smhd.js */
  write(stream) {
    this.version = 0;
    this.size = 4;
    this.writeHeader(stream);
    stream.writeUint16(this.balance);
    stream.writeUint16(0);
  }
};

// src/boxes/stco.ts
var stcoBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "ChunkOffsetBox";
  }
  static {
    this.fourcc = "stco";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    this.chunk_offsets = [];
    if (this.version === 0) {
      for (let i = 0; i < entry_count; i++) {
        this.chunk_offsets.push(stream.readUint32());
      }
    }
  }
  /** @bundle writings/stco.js */
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 4 * this.chunk_offsets.length;
    this.writeHeader(stream);
    stream.writeUint32(this.chunk_offsets.length);
    stream.writeUint32Array(this.chunk_offsets);
  }
  /** @bundle box-unpack.js */
  unpack(samples) {
    for (let i = 0; i < this.chunk_offsets.length; i++) {
      samples[i].offset = this.chunk_offsets[i];
    }
  }
};

// src/boxes/sthd.ts
var sthdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SubtitleMediaHeaderBox";
  }
  static {
    this.fourcc = "sthd";
  }
};

// src/boxes/stsc.ts
var stscBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleToChunkBox";
  }
  static {
    this.fourcc = "stsc";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    this.first_chunk = [];
    this.samples_per_chunk = [];
    this.sample_description_index = [];
    if (this.version === 0) {
      for (let i = 0; i < entry_count; i++) {
        this.first_chunk.push(stream.readUint32());
        this.samples_per_chunk.push(stream.readUint32());
        this.sample_description_index.push(stream.readUint32());
      }
    }
  }
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 12 * this.first_chunk.length;
    this.writeHeader(stream);
    stream.writeUint32(this.first_chunk.length);
    for (let i = 0; i < this.first_chunk.length; i++) {
      stream.writeUint32(this.first_chunk[i]);
      stream.writeUint32(this.samples_per_chunk[i]);
      stream.writeUint32(this.sample_description_index[i]);
    }
  }
  unpack(samples) {
    let l = 0;
    let m = 0;
    for (let i = 0; i < this.first_chunk.length; i++) {
      for (let j = 0; j < (i + 1 < this.first_chunk.length ? this.first_chunk[i + 1] : Infinity); j++) {
        m++;
        for (let k = 0; k < this.samples_per_chunk[i]; k++) {
          if (samples[l]) {
            samples[l].description_index = this.sample_description_index[i];
            samples[l].chunk_index = m;
          } else {
            return;
          }
          l++;
        }
      }
    }
  }
};

// src/boxes/stsd.ts
var stsdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleDescriptionBox";
  }
  static {
    this.fourcc = "stsd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.entries = [];
    const entryCount = stream.readUint32();
    for (let i = 1; i <= entryCount; i++) {
      const ret = parseOneBox(stream, true, this.size - (stream.getPosition() - this.start));
      if (ret.code === OK) {
        let box;
        if (ret.type in BoxRegistry.sampleEntry) {
          box = new BoxRegistry.sampleEntry[ret.type](ret.size);
          box.hdr_size = ret.hdr_size;
          box.start = ret.start;
        } else {
          Log.warn("BoxParser", `Unknown sample entry type: '${ret.type}'`);
          box = new SampleEntry(ret.size, ret.hdr_size, ret.start);
          box.type = ret.type;
        }
        if (box.write === SampleEntry.prototype.write) {
          Log.info(
            "BoxParser",
            "SampleEntry " + box.type + " box writing not yet implemented, keeping unparsed data in memory for later write"
          );
          box.parseDataAndRewind(stream);
        }
        box.parse(stream);
        this.entries.push(box);
      } else {
        return;
      }
    }
  }
  /** @bundle writing/stsd.js */
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 0;
    this.writeHeader(stream);
    stream.writeUint32(this.entries.length);
    this.size += 4;
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].write(stream);
      this.size += this.entries[i].size;
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream.adjustUint32(this.sizePosition, this.size);
  }
};

// src/boxes/stsz.ts
var stszBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "SampleSizeBox";
  }
  static {
    this.fourcc = "stsz";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.sample_sizes = [];
    if (this.version === 0) {
      this.sample_size = stream.readUint32();
      this.sample_count = stream.readUint32();
      for (let i = 0; i < this.sample_count; i++) {
        if (this.sample_size === 0) {
          this.sample_sizes.push(stream.readUint32());
        } else {
          this.sample_sizes[i] = this.sample_size;
        }
      }
    }
  }
  /** @bundle writing/stsz.js */
  write(stream) {
    let constant = true;
    this.version = 0;
    this.flags = 0;
    if (this.sample_sizes.length > 0) {
      let i = 0;
      while (i + 1 < this.sample_sizes.length) {
        if (this.sample_sizes[i + 1] !== this.sample_sizes[0]) {
          constant = false;
          break;
        } else {
          i++;
        }
      }
    } else {
      constant = false;
    }
    this.size = 8;
    if (!constant) {
      this.size += 4 * this.sample_sizes.length;
    }
    this.writeHeader(stream);
    if (!constant) {
      stream.writeUint32(0);
    } else {
      stream.writeUint32(this.sample_sizes[0]);
    }
    stream.writeUint32(this.sample_sizes.length);
    if (!constant) {
      stream.writeUint32Array(this.sample_sizes);
    }
  }
  /** @bundle box-unpack.js */
  unpack(samples) {
    for (let i = 0; i < this.sample_sizes.length; i++) {
      samples[i].size = this.sample_sizes[i];
    }
  }
};

// src/boxes/stts.ts
var sttsBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "TimeToSampleBox";
    this.sample_counts = [];
    this.sample_deltas = [];
  }
  static {
    this.fourcc = "stts";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    const entry_count = stream.readUint32();
    this.sample_counts.length = 0;
    this.sample_deltas.length = 0;
    if (this.version === 0) {
      for (let i = 0; i < entry_count; i++) {
        this.sample_counts.push(stream.readUint32());
        let delta = stream.readInt32();
        if (delta < 0) {
          Log.warn(
            "BoxParser",
            "File uses negative stts sample delta, using value 1 instead, sync may be lost!"
          );
          delta = 1;
        }
        this.sample_deltas.push(delta);
      }
    }
  }
  /** @bundle writing/stts.js */
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 8 * this.sample_counts.length;
    this.writeHeader(stream);
    stream.writeUint32(this.sample_counts.length);
    for (let i = 0; i < this.sample_counts.length; i++) {
      stream.writeUint32(this.sample_counts[i]);
      stream.writeUint32(this.sample_deltas[i]);
    }
  }
  /** @bundle box-unpack.js */
  unpack(samples) {
    let k = 0;
    for (let i = 0; i < this.sample_counts.length; i++) {
      for (let j = 0; j < this.sample_counts[i]; j++) {
        if (k === 0) {
          samples[k].dts = 0;
        } else {
          samples[k].dts = samples[k - 1].dts + this.sample_deltas[i];
        }
        k++;
      }
    }
  }
};

// src/boxes/tfdt.ts
var tfdtBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackFragmentBaseMediaDecodeTimeBox";
  }
  static {
    this.fourcc = "tfdt";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 1) {
      this.baseMediaDecodeTime = stream.readUint64();
    } else {
      this.baseMediaDecodeTime = stream.readUint32();
    }
  }
  /** @bundle writing/tdft.js */
  write(stream) {
    this.version = this.baseMediaDecodeTime > MAX_SIZE || this.version === 1 ? 1 : 0;
    this.flags = 0;
    this.size = 4;
    if (this.version === 1) {
      this.size += 4;
    }
    this.writeHeader(stream);
    if (this.version === 1) {
      stream.writeUint64(this.baseMediaDecodeTime);
    } else {
      stream.writeUint32(this.baseMediaDecodeTime);
    }
  }
};

// src/boxes/tfhd.ts
var tfhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackFragmentHeaderBox";
  }
  static {
    this.fourcc = "tfhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    let readBytes = 0;
    this.track_id = stream.readUint32();
    if (this.size - this.hdr_size > readBytes && this.flags & TFHD_FLAG_BASE_DATA_OFFSET) {
      this.base_data_offset = stream.readUint64();
      readBytes += 8;
    } else {
      this.base_data_offset = 0;
    }
    if (this.size - this.hdr_size > readBytes && this.flags & TFHD_FLAG_SAMPLE_DESC) {
      this.default_sample_description_index = stream.readUint32();
      readBytes += 4;
    } else {
      this.default_sample_description_index = 0;
    }
    if (this.size - this.hdr_size > readBytes && this.flags & TFHD_FLAG_SAMPLE_DUR) {
      this.default_sample_duration = stream.readUint32();
      readBytes += 4;
    } else {
      this.default_sample_duration = 0;
    }
    if (this.size - this.hdr_size > readBytes && this.flags & TFHD_FLAG_SAMPLE_SIZE) {
      this.default_sample_size = stream.readUint32();
      readBytes += 4;
    } else {
      this.default_sample_size = 0;
    }
    if (this.size - this.hdr_size > readBytes && this.flags & TFHD_FLAG_SAMPLE_FLAGS) {
      this.default_sample_flags = stream.readUint32();
      readBytes += 4;
    } else {
      this.default_sample_flags = 0;
    }
  }
  /** @bundle writing/tfhd.js */
  write(stream) {
    this.version = 0;
    this.size = 4;
    if (this.flags & TFHD_FLAG_BASE_DATA_OFFSET) {
      this.size += 8;
    }
    if (this.flags & TFHD_FLAG_SAMPLE_DESC) {
      this.size += 4;
    }
    if (this.flags & TFHD_FLAG_SAMPLE_DUR) {
      this.size += 4;
    }
    if (this.flags & TFHD_FLAG_SAMPLE_SIZE) {
      this.size += 4;
    }
    if (this.flags & TFHD_FLAG_SAMPLE_FLAGS) {
      this.size += 4;
    }
    this.writeHeader(stream);
    stream.writeUint32(this.track_id);
    if (this.flags & TFHD_FLAG_BASE_DATA_OFFSET) {
      stream.writeUint64(this.base_data_offset);
    }
    if (this.flags & TFHD_FLAG_SAMPLE_DESC) {
      stream.writeUint32(this.default_sample_description_index);
    }
    if (this.flags & TFHD_FLAG_SAMPLE_DUR) {
      stream.writeUint32(this.default_sample_duration);
    }
    if (this.flags & TFHD_FLAG_SAMPLE_SIZE) {
      stream.writeUint32(this.default_sample_size);
    }
    if (this.flags & TFHD_FLAG_SAMPLE_FLAGS) {
      stream.writeUint32(this.default_sample_flags);
    }
  }
};

// src/boxes/tkhd.ts
var tkhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackHeaderBox";
  }
  static {
    this.fourcc = "tkhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.version === 1) {
      this.creation_time = stream.readUint64();
      this.modification_time = stream.readUint64();
      this.track_id = stream.readUint32();
      stream.readUint32();
      this.duration = stream.readUint64();
    } else {
      this.creation_time = stream.readUint32();
      this.modification_time = stream.readUint32();
      this.track_id = stream.readUint32();
      stream.readUint32();
      this.duration = stream.readUint32();
    }
    stream.readUint32Array(2);
    this.layer = stream.readInt16();
    this.alternate_group = stream.readInt16();
    this.volume = stream.readInt16() >> 8;
    stream.readUint16();
    this.matrix = stream.readInt32Array(9);
    this.width = stream.readUint32();
    this.height = stream.readUint32();
  }
  /** @bundle box-print.js */
  print(output) {
    super.printHeader(output);
    output.log(output.indent + "creation_time: " + this.creation_time);
    output.log(output.indent + "modification_time: " + this.modification_time);
    output.log(output.indent + "track_id: " + this.track_id);
    output.log(output.indent + "duration: " + this.duration);
    output.log(output.indent + "volume: " + (this.volume >> 8));
    output.log(output.indent + "matrix: " + this.matrix.join(", "));
    output.log(output.indent + "layer: " + this.layer);
    output.log(output.indent + "alternate_group: " + this.alternate_group);
    output.log(output.indent + "width: " + this.width);
    output.log(output.indent + "height: " + this.height);
  }
};

// src/boxes/trex.ts
var trexBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackExtendsBox";
  }
  static {
    this.fourcc = "trex";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.track_id = stream.readUint32();
    this.default_sample_description_index = stream.readUint32();
    this.default_sample_duration = stream.readUint32();
    this.default_sample_size = stream.readUint32();
    this.default_sample_flags = stream.readUint32();
  }
  write(stream) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 * 5;
    this.writeHeader(stream);
    stream.writeUint32(this.track_id);
    stream.writeUint32(this.default_sample_description_index);
    stream.writeUint32(this.default_sample_duration);
    stream.writeUint32(this.default_sample_size);
    stream.writeUint32(this.default_sample_flags);
  }
};

// src/boxes/trun.ts
var trunBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "TrackRunBox";
  }
  static {
    this.fourcc = "trun";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    let readBytes = 0;
    this.sample_count = stream.readUint32();
    readBytes += 4;
    if (this.size - this.hdr_size > readBytes && this.flags & TRUN_FLAGS_DATA_OFFSET) {
      this.data_offset = stream.readInt32();
      readBytes += 4;
    } else {
      this.data_offset = 0;
    }
    if (this.size - this.hdr_size > readBytes && this.flags & TRUN_FLAGS_FIRST_FLAG) {
      this.first_sample_flags = stream.readUint32();
      readBytes += 4;
    } else {
      this.first_sample_flags = 0;
    }
    this.sample_duration = [];
    this.sample_size = [];
    this.sample_flags = [];
    this.sample_composition_time_offset = [];
    if (this.size - this.hdr_size > readBytes) {
      for (let i = 0; i < this.sample_count; i++) {
        if (this.flags & TRUN_FLAGS_DURATION) {
          this.sample_duration[i] = stream.readUint32();
        }
        if (this.flags & TRUN_FLAGS_SIZE) {
          this.sample_size[i] = stream.readUint32();
        }
        if (this.flags & TRUN_FLAGS_FLAGS) {
          this.sample_flags[i] = stream.readUint32();
        }
        if (this.flags & TRUN_FLAGS_CTS_OFFSET) {
          if (this.version === 0) {
            this.sample_composition_time_offset[i] = stream.readUint32();
          } else {
            this.sample_composition_time_offset[i] = stream.readInt32();
          }
        }
      }
    }
  }
  /** @bundle writing/trun.js */
  write(stream) {
    this.size = 4;
    if (this.flags & TRUN_FLAGS_DATA_OFFSET) {
      this.size += 4;
    }
    if (this.flags & TRUN_FLAGS_FIRST_FLAG) {
      this.size += 4;
    }
    if (this.flags & TRUN_FLAGS_DURATION) {
      this.size += 4 * this.sample_duration.length;
    }
    if (this.flags & TRUN_FLAGS_SIZE) {
      this.size += 4 * this.sample_size.length;
    }
    if (this.flags & TRUN_FLAGS_FLAGS) {
      this.size += 4 * this.sample_flags.length;
    }
    if (this.flags & TRUN_FLAGS_CTS_OFFSET) {
      this.size += 4 * this.sample_composition_time_offset.length;
    }
    this.writeHeader(stream);
    stream.writeUint32(this.sample_count);
    if (this.flags & TRUN_FLAGS_DATA_OFFSET) {
      this.data_offset_position = stream.getPosition();
      stream.writeInt32(this.data_offset);
    }
    if (this.flags & TRUN_FLAGS_FIRST_FLAG) {
      stream.writeUint32(this.first_sample_flags);
    }
    for (let i = 0; i < this.sample_count; i++) {
      if (this.flags & TRUN_FLAGS_DURATION) {
        stream.writeUint32(this.sample_duration[i]);
      }
      if (this.flags & TRUN_FLAGS_SIZE) {
        stream.writeUint32(this.sample_size[i]);
      }
      if (this.flags & TRUN_FLAGS_FLAGS) {
        stream.writeUint32(this.sample_flags[i]);
      }
      if (this.flags & TRUN_FLAGS_CTS_OFFSET) {
        if (this.version === 0) {
          stream.writeUint32(this.sample_composition_time_offset[i]);
        } else {
          stream.writeInt32(this.sample_composition_time_offset[i]);
        }
      }
    }
  }
};

// src/boxes/url.ts
var urlBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "DataEntryUrlBox";
  }
  static {
    this.fourcc = "url ";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    if (this.flags !== 1) {
      this.location = stream.readCString();
    }
  }
  /** @bundle writing/url.js */
  write(stream) {
    this.version = 0;
    if (this.location) {
      this.flags = 0;
      this.size = this.location.length + 1;
    } else {
      this.flags = 1;
      this.size = 0;
    }
    this.writeHeader(stream);
    if (this.location) {
      stream.writeCString(this.location);
    }
  }
};

// src/boxes/vmhd.ts
var vmhdBox = class extends FullBox {
  constructor() {
    super(...arguments);
    this.box_name = "VideoMediaHeaderBox";
  }
  static {
    this.fourcc = "vmhd";
  }
  parse(stream) {
    this.parseFullHeader(stream);
    this.graphicsmode = stream.readUint16();
    this.opcolor = stream.readUint16Array(3);
  }
  /** @bundle writing/vmhd.js */
  write(stream) {
    this.version = 0;
    this.size = 8;
    this.writeHeader(stream);
    stream.writeUint16(this.graphicsmode);
    stream.writeUint16Array(this.opcolor);
  }
};

// src/isofile.ts
var SampleGroupInfo = class {
  constructor(grouping_type, grouping_type_parameter, sbgp) {
    this.grouping_type = grouping_type;
    this.grouping_type_parameter = grouping_type_parameter;
    this.sbgp = sbgp;
    this.last_sample_in_run = -1;
    this.entry_index = -1;
  }
};
var ISOFile = class _ISOFile {
  constructor(stream, discardMdatData = true) {
    /** Array of all boxes (in order) found in the file */
    this.boxes = [];
    /** Array of all mdats */
    this.mdats = [];
    /** Array of all moofs */
    this.moofs = [];
    /** Boolean indicating if the file is compatible with progressive parsing (moov first) */
    this.isProgressive = false;
    /** Boolean used to fire moov start event only once */
    this.moovStartFound = false;
    /** Callback called when the moov parsing starts */
    this.onMoovStart = null;
    /** Boolean keeping track of the call to onMoovStart, to avoid double calls */
    this.moovStartSent = false;
    /** Callback called when the moov is entirely parsed */
    this.onReady = null;
    /** Boolean keeping track of the call to onReady, to avoid double calls */
    this.readySent = false;
    /** Callback to call when segments are ready */
    this.onSegment = null;
    /** Callback to call when samples are ready */
    this.onSamples = null;
    /** Callback to call when there is an error in the parsing or processing of samples */
    this.onError = null;
    /** Callback to call when an item is processed */
    this.onItem = null;
    /** Boolean indicating if the moov box run-length encoded tables of sample information have been processed */
    this.sampleListBuilt = false;
    /** Array of Track objects for which fragmentation of samples is requested */
    this.fragmentedTracks = [];
    /** Array of Track objects for which extraction of samples is requested */
    this.extractedTracks = [];
    /** Boolean indicating that fragmention is ready */
    this.isFragmentationInitialized = false;
    /** Boolean indicating that fragmented has started */
    this.sampleProcessingStarted = false;
    /** Number of the next 'moof' to generate when fragmenting */
    this.nextMoofNumber = 0;
    /** Boolean indicating if the initial list of items has been produced */
    this.itemListBuilt = false;
    /** Callback called when the sidx box is entirely parsed */
    this.onSidx = null;
    /** Boolean keeping track of the call to onSidx, to avoid double calls */
    this.sidxSent = false;
    /** @bundle isofile-item-processing.js */
    this.items = [];
    /** @bundle isofile-item-processing.js */
    this.entity_groups = [];
    /**
     * size of the buffers allocated for samples
     * @bundle isofile-item-processing.js
     */
    this.itemsDataSize = 0;
    /**
     * Index of the last moof box received
     * @bundle isofile-sample-processing.js
     */
    this.lastMoofIndex = 0;
    /**
     * size of the buffers allocated for samples
     * @bundle isofile-sample-processing.js
     */
    this.samplesDataSize = 0;
    /**
     * position in the current buffer of the beginning of the last box parsed
     *
     * @bundle isofile-advanced-parsing.js
     */
    this.lastBoxStartPosition = 0;
    /**
     * indicator if the parsing is stuck in the middle of an mdat box
     *
     * @bundle isofile-advanced-parsing.js
     */
    this.parsingMdat = null;
    /* next file position that the parser needs:
     *  - 0 until the first buffer (i.e. fileStart ===0) has been received
     *  - otherwise, the next box start until the moov box has been parsed
     *  - otherwise, the position of the next sample to fetch
     * @bundle isofile-advanced-parsing.js
     */
    this.nextParsePosition = 0;
    /**
     * keep mdat data
     *
     * @bundle isofile-advanced-parsing.js
     */
    this.discardMdatData = true;
    this.discardMdatData = discardMdatData;
    if (stream) {
      this.stream = stream;
      this.parse();
    } else {
      this.stream = new MultiBufferStream();
    }
  }
  setSegmentOptions(id, user, {
    nbSamples: nb_samples = 1e3,
    rapAlignement = true
  } = {}) {
    const trak = this.getTrackById(id);
    if (trak) {
      const fragTrack = {
        id,
        user,
        trak,
        segmentStream: null,
        nb_samples,
        rapAlignement
      };
      this.fragmentedTracks.push(fragTrack);
      trak.nextSample = 0;
    }
  }
  unsetSegmentOptions(id) {
    let index = -1;
    for (let i = 0; i < this.fragmentedTracks.length; i++) {
      const fragTrack = this.fragmentedTracks[i];
      if (fragTrack.id === id) {
        index = i;
      }
    }
    if (index > -1) {
      this.fragmentedTracks.splice(index, 1);
    }
  }
  setExtractionOptions(id, user, { nbSamples: nb_samples = 1e3 } = {}) {
    const trak = this.getTrackById(id);
    if (trak) {
      this.extractedTracks.push({
        id,
        user,
        trak,
        nb_samples,
        samples: []
      });
      trak.nextSample = 0;
    }
  }
  unsetExtractionOptions(id) {
    let index = -1;
    for (let i = 0; i < this.extractedTracks.length; i++) {
      const extractTrack = this.extractedTracks[i];
      if (extractTrack.id === id) {
        index = i;
      }
    }
    if (index > -1) {
      this.extractedTracks.splice(index, 1);
    }
  }
  parse() {
    const parseBoxHeadersOnly = false;
    if (this.restoreParsePosition) {
      if (!this.restoreParsePosition()) {
        return;
      }
    }
    while (true) {
      if (this.hasIncompleteMdat && this.hasIncompleteMdat()) {
        if (this.processIncompleteMdat()) {
          continue;
        } else {
          return;
        }
      } else {
        if (this.saveParsePosition) {
          this.saveParsePosition();
        }
        const ret = parseOneBox(this.stream, parseBoxHeadersOnly);
        if (ret.code === ERR_NOT_ENOUGH_DATA) {
          if (this.processIncompleteBox) {
            if (this.processIncompleteBox(ret)) {
              continue;
            } else {
              return;
            }
          } else {
            return;
          }
        } else if (ret.code === OK) {
          const box = ret.box;
          this.boxes.push(box);
          if (box.type === "uuid") {
            if (this[box.uuid] !== void 0) {
              Log.warn(
                "ISOFile",
                "Duplicate Box of uuid: " + box.uuid + ", overriding previous occurrence"
              );
            }
            this[box.uuid] = box;
          } else {
            switch (box.type) {
              case "mdat":
                this.mdats.push(box);
                this.transferMdatData(box);
                break;
              case "moof":
                this.moofs.push(box);
                break;
              case "free":
              case "skip":
                break;
              case "moov":
                this.moovStartFound = true;
                if (this.mdats.length === 0) {
                  this.isProgressive = true;
                }
              /* no break */
              /* falls through */
              default:
                if (this[box.type] !== void 0) {
                  if (Array.isArray(this[box.type + "s"])) {
                    Log.info(
                      "ISOFile",
                      `Found multiple boxes of type ${box.type} in ISOFile, adding to array`
                    );
                    this[box.type + "s"].push(box);
                  } else {
                    Log.warn(
                      "ISOFile",
                      `Found multiple boxes of type ${box.type} but no array exists. Creating array dynamically.`
                    );
                    this[box.type + "s"] = [this[box.type], box];
                  }
                } else {
                  this[box.type] = box;
                  if (Array.isArray(this[box.type + "s"])) {
                    this[box.type + "s"].push(box);
                  }
                }
                break;
            }
          }
          if (this.updateUsedBytes) {
            this.updateUsedBytes(box, ret);
          }
        } else if (ret.code === ERR_INVALID_DATA) {
          Log.error(
            "ISOFile",
            `Invalid data found while parsing box of type '${ret.type}' at position ${ret.start}. Aborting parsing.`,
            this
          );
          break;
        }
      }
    }
  }
  checkBuffer(ab) {
    if (ab === null || ab === void 0) {
      throw new Error("Buffer must be defined and non empty");
    }
    if (ab.byteLength === 0) {
      Log.warn("ISOFile", "Ignoring empty buffer (fileStart: " + ab.fileStart + ")");
      this.stream.logBufferLevel();
      return false;
    }
    Log.info("ISOFile", "Processing buffer (fileStart: " + ab.fileStart + ")");
    ab.usedBytes = 0;
    this.stream.insertBuffer(ab);
    this.stream.logBufferLevel();
    if (!this.stream.initialized()) {
      Log.warn("ISOFile", "Not ready to start parsing");
      return false;
    }
    return true;
  }
  /**
   * Processes a new ArrayBuffer (with a fileStart property)
   * Returns the next expected file position, or undefined if not ready to parse
   */
  appendBuffer(ab, last) {
    let nextFileStart;
    if (!this.checkBuffer(ab)) {
      return;
    }
    this.parse();
    if (this.moovStartFound && !this.moovStartSent) {
      this.moovStartSent = true;
      if (this.onMoovStart) this.onMoovStart();
    }
    if (this.moov) {
      if (!this.sampleListBuilt) {
        this.buildSampleLists();
        this.sampleListBuilt = true;
      }
      this.updateSampleLists();
      if (this.onReady && !this.readySent) {
        this.readySent = true;
        this.onReady(this.getInfo());
      }
      this.processSamples(last);
      if (this.nextSeekPosition) {
        nextFileStart = this.nextSeekPosition;
        this.nextSeekPosition = void 0;
      } else {
        nextFileStart = this.nextParsePosition;
      }
      if (this.stream.getEndFilePositionAfter) {
        nextFileStart = this.stream.getEndFilePositionAfter(nextFileStart);
      }
    } else {
      if (this.nextParsePosition) {
        nextFileStart = this.nextParsePosition;
      } else {
        nextFileStart = 0;
      }
    }
    if (this.sidx) {
      if (this.onSidx && !this.sidxSent) {
        this.onSidx(this.sidx);
        this.sidxSent = true;
      }
    }
    if (this.meta) {
      if (this.flattenItemInfo && !this.itemListBuilt) {
        this.flattenItemInfo();
        this.itemListBuilt = true;
      }
      if (this.processItems) {
        this.processItems(this.onItem);
      }
    }
    if (this.stream.cleanBuffers) {
      Log.info(
        "ISOFile",
        "Done processing buffer (fileStart: " + ab.fileStart + ") - next buffer to fetch should have a fileStart position of " + nextFileStart
      );
      this.stream.logBufferLevel();
      this.stream.cleanBuffers();
      this.stream.logBufferLevel(true);
      Log.info("ISOFile", "Sample data size in memory: " + this.getAllocatedSampleDataSize());
    }
    return nextFileStart;
  }
  getInfo() {
    if (!this.moov) {
      return {
        hasMoov: false,
        mime: ""
      };
    }
    const _1904 = (/* @__PURE__ */ new Date("1904-01-01T00:00:00Z")).getTime();
    const isFragmented = this.moov.mvex?.mehd !== void 0;
    const movie = {
      hasMoov: true,
      duration: this.moov.mvhd.duration,
      timescale: this.moov.mvhd.timescale,
      isFragmented,
      fragment_duration: isFragmented ? this.moov.mvex.mehd.fragment_duration : void 0,
      isProgressive: this.isProgressive,
      hasIOD: this.moov.iods !== null,
      brands: [this.ftyp.major_brand].concat(this.ftyp.compatible_brands),
      created: new Date(_1904 + this.moov.mvhd.creation_time * 1e3),
      modified: new Date(_1904 + this.moov.mvhd.modification_time * 1e3),
      tracks: [],
      audioTracks: [],
      videoTracks: [],
      subtitleTracks: [],
      metadataTracks: [],
      hintTracks: [],
      otherTracks: [],
      mime: ""
    };
    for (let i = 0; i < this.moov.traks.length; i++) {
      const trak = this.moov.traks[i];
      const sample_desc = trak.mdia.minf.stbl.stsd.entries[0];
      const size = trak.samples_size;
      const track_timescale = trak.mdia.mdhd.timescale;
      const samples_duration = trak.samples_duration;
      const bitrate = size * 8 * track_timescale / samples_duration;
      const track = {
        samples_duration,
        bitrate,
        size,
        timescale: track_timescale,
        alternate_group: trak.tkhd.alternate_group,
        codec: sample_desc.getCodec(),
        created: new Date(_1904 + trak.tkhd.creation_time * 1e3),
        cts_shift: trak.mdia.minf.stbl.cslg,
        duration: trak.mdia.mdhd.duration,
        id: trak.tkhd.track_id,
        kind: trak.udta && trak.udta.kinds.length ? trak.udta.kinds[0] : { schemeURI: "", value: "" },
        // NOTE:   trak.mdia.elng used to be trak.mdia.eln
        language: trak.mdia.elng ? trak.mdia.elng.extended_language : trak.mdia.mdhd.languageString,
        layer: trak.tkhd.layer,
        matrix: trak.tkhd.matrix,
        modified: new Date(_1904 + trak.tkhd.modification_time * 1e3),
        movie_duration: trak.tkhd.duration,
        movie_timescale: movie.timescale,
        name: trak.mdia.hdlr.name,
        nb_samples: trak.samples.length,
        references: [],
        track_height: trak.tkhd.height / (1 << 16),
        track_width: trak.tkhd.width / (1 << 16),
        volume: trak.tkhd.volume
      };
      movie.tracks.push(track);
      if (trak.tref) {
        for (let j = 0; j < trak.tref.references.length; j++) {
          track.references.push({
            type: trak.tref.references[j].type,
            track_ids: trak.tref.references[j].track_ids
          });
        }
      }
      if (trak.edts) {
        track.edits = trak.edts.elst.entries;
      }
      if (sample_desc instanceof AudioSampleEntry) {
        track.type = "audio";
        movie.audioTracks.push(track);
        track.audio = {
          sample_rate: sample_desc.getSampleRate(),
          channel_count: sample_desc.getChannelCount(),
          sample_size: sample_desc.getSampleSize()
        };
      } else if (sample_desc instanceof VisualSampleEntry) {
        track.type = "video";
        movie.videoTracks.push(track);
        track.video = {
          width: sample_desc.getWidth(),
          height: sample_desc.getHeight()
        };
      } else if (sample_desc instanceof SubtitleSampleEntry) {
        track.type = "subtitles";
        movie.subtitleTracks.push(track);
      } else if (sample_desc instanceof HintSampleEntry) {
        track.type = "metadata";
        movie.hintTracks.push(track);
      } else if (sample_desc instanceof MetadataSampleEntry) {
        track.type = "metadata";
        movie.metadataTracks.push(track);
      } else {
        track.type = "metadata";
        movie.otherTracks.push(track);
      }
    }
    if (movie.videoTracks && movie.videoTracks.length > 0) {
      movie.mime += 'video/mp4; codecs="';
    } else if (movie.audioTracks && movie.audioTracks.length > 0) {
      movie.mime += 'audio/mp4; codecs="';
    } else {
      movie.mime += 'application/mp4; codecs="';
    }
    for (let i = 0; i < movie.tracks.length; i++) {
      if (i !== 0) movie.mime += ",";
      movie.mime += movie.tracks[i].codec;
    }
    movie.mime += '"; profiles="';
    movie.mime += this.ftyp.compatible_brands.join();
    movie.mime += '"';
    return movie;
  }
  setNextSeekPositionFromSample(sample) {
    if (!sample) {
      return;
    }
    if (this.nextSeekPosition) {
      this.nextSeekPosition = Math.min(sample.offset + sample.alreadyRead, this.nextSeekPosition);
    } else {
      this.nextSeekPosition = sample.offset + sample.alreadyRead;
    }
  }
  processSamples(last) {
    if (!this.sampleProcessingStarted) return;
    if (this.isFragmentationInitialized && this.onSegment !== null) {
      for (let i = 0; i < this.fragmentedTracks.length; i++) {
        const fragTrak = this.fragmentedTracks[i];
        const trak = fragTrak.trak;
        while (trak.nextSample < trak.samples.length && this.sampleProcessingStarted) {
          Log.debug(
            "ISOFile",
            "Creating media fragment on track #" + fragTrak.id + " for sample " + trak.nextSample
          );
          const result = this.createFragment(fragTrak.id, trak.nextSample, fragTrak.segmentStream);
          if (result) {
            fragTrak.segmentStream = result;
            trak.nextSample++;
          } else {
            break;
          }
          if (trak.nextSample % fragTrak.nb_samples === 0 || last || trak.nextSample >= trak.samples.length) {
            Log.info(
              "ISOFile",
              "Sending fragmented data on track #" + fragTrak.id + " for samples [" + Math.max(0, trak.nextSample - fragTrak.nb_samples) + "," + (trak.nextSample - 1) + "]"
            );
            Log.info("ISOFile", "Sample data size in memory: " + this.getAllocatedSampleDataSize());
            if (this.onSegment) {
              this.onSegment(
                fragTrak.id,
                fragTrak.user,
                fragTrak.segmentStream.buffer,
                trak.nextSample,
                last || trak.nextSample >= trak.samples.length
              );
            }
            fragTrak.segmentStream = null;
            if (fragTrak !== this.fragmentedTracks[i]) {
              break;
            }
          }
        }
      }
    }
    if (this.onSamples !== null) {
      for (let i = 0; i < this.extractedTracks.length; i++) {
        const extractTrak = this.extractedTracks[i];
        const trak = extractTrak.trak;
        while (trak.nextSample < trak.samples.length && this.sampleProcessingStarted) {
          Log.debug(
            "ISOFile",
            "Exporting on track #" + extractTrak.id + " sample #" + trak.nextSample
          );
          const sample = this.getSample(trak, trak.nextSample);
          if (sample) {
            trak.nextSample++;
            extractTrak.samples.push(sample);
          } else {
            this.setNextSeekPositionFromSample(trak.samples[trak.nextSample]);
            break;
          }
          if (trak.nextSample % extractTrak.nb_samples === 0 || trak.nextSample >= trak.samples.length) {
            Log.debug(
              "ISOFile",
              "Sending samples on track #" + extractTrak.id + " for sample " + trak.nextSample
            );
            if (this.onSamples) {
              this.onSamples(extractTrak.id, extractTrak.user, extractTrak.samples);
            }
            extractTrak.samples = [];
            if (extractTrak !== this.extractedTracks[i]) {
              break;
            }
          }
        }
      }
    }
  }
  /* Find and return specific boxes using recursion and early return */
  getBox(type) {
    const result = this.getBoxes(type, true);
    return result.length ? result[0] : null;
  }
  getBoxes(type, returnEarly) {
    const result = [];
    const sweep = (root) => {
      if (root instanceof Box && root.type && root.type === type) {
        result.push(root);
      }
      const inner = [];
      if (root["boxes"]) inner.push(...root.boxes);
      if (root["entries"]) inner.push(...root["entries"]);
      if (root["item_infos"]) inner.push(...root["item_infos"]);
      if (root["references"]) inner.push(...root["references"]);
      for (const box of inner) {
        if (result.length && returnEarly) return;
        sweep(box);
      }
    };
    sweep(this);
    return result;
  }
  getTrackSamplesInfo(track_id) {
    const track = this.getTrackById(track_id);
    if (track) {
      return track.samples;
    } else {
      return;
    }
  }
  getTrackSample(track_id, number) {
    const track = this.getTrackById(track_id);
    const sample = this.getSample(track, number);
    return sample;
  }
  /* Called by the application to release the resources associated to samples already forwarded to the application */
  releaseUsedSamples(id, sampleNum) {
    let size = 0;
    const trak = this.getTrackById(id);
    if (!trak.lastValidSample) trak.lastValidSample = 0;
    for (let i = trak.lastValidSample; i < sampleNum; i++) {
      size += this.releaseSample(trak, i);
    }
    Log.info(
      "ISOFile",
      "Track #" + id + " released samples up to " + sampleNum + " (released size: " + size + ", remaining: " + this.samplesDataSize + ")"
    );
    trak.lastValidSample = sampleNum;
  }
  start() {
    this.sampleProcessingStarted = true;
    this.processSamples(false);
  }
  stop() {
    this.sampleProcessingStarted = false;
  }
  /* Called by the application to flush the remaining samples (e.g. once the download is finished or when no more samples will be added) */
  flush() {
    Log.info("ISOFile", "Flushing remaining samples");
    this.updateSampleLists();
    this.processSamples(true);
    this.stream.cleanBuffers();
    this.stream.logBufferLevel(true);
  }
  /* Finds the byte offset for a given time on a given track
     also returns the time of the previous rap */
  seekTrack(time, useRap, trak) {
    let rap_seek_sample_num = 0;
    let seek_sample_num = 0;
    let timescale = null;
    if (trak.samples.length === 0) {
      Log.info(
        "ISOFile",
        "No sample in track, cannot seek! Using time " + Log.getDurationString(0, 1) + " and offset: 0"
      );
      return { offset: 0, time: 0 };
    }
    for (let j = 0; j < trak.samples.length; j++) {
      const sample = trak.samples[j];
      if (j === 0) {
        seek_sample_num = 0;
        timescale = sample.timescale;
      } else if (sample.cts > time * sample.timescale) {
        seek_sample_num = j - 1;
        break;
      }
      if (useRap && sample.is_sync) {
        rap_seek_sample_num = j;
      }
    }
    if (useRap) {
      seek_sample_num = rap_seek_sample_num;
    }
    time = trak.samples[seek_sample_num].cts;
    trak.nextSample = seek_sample_num;
    while (trak.samples[seek_sample_num].alreadyRead === trak.samples[seek_sample_num].size) {
      if (!trak.samples[seek_sample_num + 1]) {
        break;
      }
      seek_sample_num++;
    }
    const seek_offset = trak.samples[seek_sample_num].offset + trak.samples[seek_sample_num].alreadyRead;
    Log.info(
      "ISOFile",
      "Seeking to " + (useRap ? "RAP" : "") + " sample #" + trak.nextSample + " on track " + trak.tkhd.track_id + ", time " + Log.getDurationString(time, timescale) + " and offset: " + seek_offset
    );
    return { offset: seek_offset, time: time / timescale };
  }
  getTrackDuration(trak) {
    if (!trak.samples) {
      return Infinity;
    }
    const sample = trak.samples[trak.samples.length - 1];
    return (sample.cts + sample.duration) / sample.timescale;
  }
  /* Finds the byte offset in the file corresponding to the given time or to the time of the previous RAP */
  seek(time, useRap) {
    const moov = this.moov;
    let seek_info = { offset: Infinity, time: Infinity };
    if (!this.moov) {
      throw new Error("Cannot seek: moov not received!");
    } else {
      for (let i = 0; i < moov.traks.length; i++) {
        const trak = moov.traks[i];
        if (time > this.getTrackDuration(trak)) {
          continue;
        }
        const trak_seek_info = this.seekTrack(time, useRap, trak);
        if (trak_seek_info.offset < seek_info.offset) {
          seek_info.offset = trak_seek_info.offset;
        }
        if (trak_seek_info.time < seek_info.time) {
          seek_info.time = trak_seek_info.time;
        }
      }
      Log.info(
        "ISOFile",
        "Seeking at time " + Log.getDurationString(seek_info.time, 1) + " needs
