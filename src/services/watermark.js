const Jimp = require('jimp');
const path = require('path');

/**
 * Applies a watermark text overlay in the center of the image and resizes it for preview.
 * @param {string} inputPath Path to original image file
 * @param {string} outputPath Path where watermarked preview should be saved
 * @param {string} watermarkText Text to overlay as watermark
 */
async function applyWatermark(inputPath, outputPath, watermarkText = 'TmStudio - PREVIEW ONLY') {
  try {
    const image = await Jimp.read(inputPath);
    
    // Resize image for preview to save bandwidth and prevent high-res theft
    // Max width 800, keep aspect ratio
    if (image.bitmap.width > 800) {
      image.resize(800, Jimp.AUTO);
    }

    // Load a built-in Jimp font (white, 32px or 16px depending on image size)
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    
    // Calculate dimensions to center the text
    const textWidth = Jimp.measureText(font, watermarkText);
    const textHeight = Jimp.measureTextHeight(font, watermarkText, image.bitmap.width);
    
    const x = (image.bitmap.width - textWidth) / 2;
    const y = (image.bitmap.height - textHeight) / 2;

    // Draw a semi-transparent dark banner across the center
    const bannerHeight = 70;
    const banner = new Jimp(image.bitmap.width, bannerHeight, 0x000000aa); // aa is alpha opacity
    
    image.composite(banner, 0, (image.bitmap.height - bannerHeight) / 2, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 0.6,
      opacityDest: 1
    });

    // Print text on top of the banner
    image.print(
      font, 
      x, 
      (image.bitmap.height - textHeight) / 2, 
      watermarkText
    );

    // Save the file
    await image.writeAsync(outputPath);
    return true;
  } catch (error) {
    console.error('Error in applyWatermark service:', error);
    throw error;
  }
}

module.exports = {
  applyWatermark
};
