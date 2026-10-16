<?php

namespace App\Services\Receipts;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Validates an uploaded receipt by its real bytes, then re-encodes it to a
 * downscaled JPEG. Re-encoding drops EXIF (GPS, device) metadata and anything
 * smuggled after the image data; downscaling keeps OCR fast.
 */
class ReceiptImage
{
    public const MAX_EDGE = 1600;

    private const MAX_PIXELS = 50_000_000;

    private const ALLOWED = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
    ];

    public static function store(UploadedFile $file): string
    {
        $extension = strtolower($file->getClientOriginalExtension());
        $sniffed = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());

        if (! isset(self::ALLOWED[$sniffed]) || ! in_array($extension, self::ALLOWED[$sniffed], true)) {
            throw ValidationException::withMessages(['receipt' => 'Upload a JPEG or PNG photo of the receipt.']);
        }

        // Check dimensions before decoding, so a tiny file can't claim a huge bitmap.
        $size = @getimagesize($file->getRealPath());
        if (! $size || $size[0] * $size[1] > self::MAX_PIXELS) {
            throw ValidationException::withMessages(['receipt' => 'That image is too large. Use a normal phone photo.']);
        }
        // A 50 MP bitmap needs ~250 MB while being scaled down.
        ini_set('memory_limit', '384M');

        $image = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if ($image === false) {
            throw ValidationException::withMessages(['receipt' => 'That image could not be read. Try taking the photo again.']);
        }

        $image = self::applyOrientation($image, $file->getRealPath(), $sniffed);
        $image = self::downscale($image);

        $path = 'receipts/'.Str::random(40).'.jpg';
        ob_start();
        imagejpeg($image, null, 85);
        Storage::disk(config('filesystems.receipt_disk'))->put($path, (string) ob_get_clean());

        return $path;
    }

    private static function applyOrientation(\GdImage $image, string $path, string $mime): \GdImage
    {
        if ($mime !== 'image/jpeg' || ! function_exists('exif_read_data')) {
            return $image;
        }
        $orientation = (int) (@exif_read_data($path)['Orientation'] ?? 1);
        $angle = [3 => 180, 6 => -90, 8 => 90][$orientation] ?? 0;

        return $angle ? (imagerotate($image, $angle, 0) ?: $image) : $image;
    }

    private static function downscale(\GdImage $image): \GdImage
    {
        $w = imagesx($image);
        $h = imagesy($image);
        $scale = self::MAX_EDGE / max($w, $h);
        if ($scale >= 1) {
            return $image;
        }

        return imagescale($image, (int) round($w * $scale), (int) round($h * $scale), IMG_BICUBIC) ?: $image;
    }
}
