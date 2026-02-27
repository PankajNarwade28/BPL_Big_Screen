/**
 * Cloudinary Image Optimization Utilities
 * 
 * These utilities help transform Cloudinary URLs to deliver images
 * with appropriate size and quality based on their display context.
 */

/**
 * Transform a Cloudinary URL with size and quality parameters
 * @param {string} url - The original Cloudinary URL
 * @param {object} options - Transformation options
 * @param {number} options.width - Target width in pixels
 * @param {number} options.height - Target height in pixels
 * @param {string} options.crop - Crop mode (fill, fit, scale, thumb, etc.)
 * @param {string} options.quality - Quality (auto, best, good, eco, low) or number 1-100
 * @param {string} options.format - Format (auto, webp, jpg, png)
 * @param {boolean} options.dpr - Enable device pixel ratio (auto)
 * @returns {string} - Transformed Cloudinary URL
 */
export const transformCloudinaryImage = (url, options = {}) => {
  // Return as-is if not a Cloudinary URL
  if (!url || !url.includes('res.cloudinary.com')) {
    return url;
  }

  const {
    width,
    height,
    crop = 'fill',
    quality = 'auto',
    format = 'auto',
    dpr = true,
  } = options;

  // Parse the Cloudinary URL
  // Format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{version}/{public_id}.{format}
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;

  const baseUrl = url.substring(0, uploadIndex + 8); // Include '/upload/'
  const remainingUrl = url.substring(uploadIndex + 8);

  // Build transformation string
  const transformations = [];
  
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (crop && (width || height)) transformations.push(`c_${crop}`);
  if (quality) transformations.push(`q_${quality}`);
  if (format) transformations.push(`f_${format}`);
  if (dpr) transformations.push('dpr_auto');
  
  // Add gravity for better cropping (faces first, then center)
  if (crop === 'fill' || crop === 'thumb') {
    transformations.push('g_auto:subject');
  }

  const transformString = transformations.join(',');
  
  return `${baseUrl}${transformString}/${remainingUrl}`;
};

/**
 * Predefined image transformations for common use cases
 */
export const ImageSizes = {
  // Thumbnails - Small circular avatars
  THUMBNAIL: {
    width: 80,
    height: 80,
    crop: 'thumb',
    quality: 'auto',
    format: 'auto',
  },
  
  // Player card in table/list view
  PLAYER_LIST: {
    width: 120,
    height: 120,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
  },
  
  // Player card - Main display
  PLAYER_CARD: {
    width: 300,
    height: 400,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
  },
  
  // Big screen - Full player display
  PLAYER_FULLSCREEN: {
    width: 600,
    height: 800,
    crop: 'fill',
    quality: 'best',
    format: 'auto',
  },
  
  // Team logo - Small
  TEAM_LOGO_SMALL: {
    width: 60,
    height: 60,
    crop: 'fit',
    quality: 'auto',
    format: 'auto',
  },
  
  // Team logo - Medium
  TEAM_LOGO_MEDIUM: {
    width: 120,
    height: 120,
    crop: 'fit',
    quality: 'auto',
    format: 'auto',
  },
  
  // Team logo - Large
  TEAM_LOGO_LARGE: {
    width: 200,
    height: 200,
    crop: 'fit',
    quality: 'best',
    format: 'auto',
  },
};

/**
 * Get optimized image URL for specific use case
 */
export const getOptimizedImageUrl = (url, sizePreset) => {
  if (!url) return null;
  
  // If not a Cloudinary URL, return as-is
  if (!url.includes('res.cloudinary.com')) {
    return url;
  }
  
  return transformCloudinaryImage(url, sizePreset);
};

/**
 * Get player image with appropriate quality
 */
export const getPlayerImage = (photoUrl, context = 'card') => {
  const sizeMap = {
    'thumbnail': ImageSizes.THUMBNAIL,
    'list': ImageSizes.PLAYER_LIST,
    'card': ImageSizes.PLAYER_CARD,
    'fullscreen': ImageSizes.PLAYER_FULLSCREEN,
  };
  
  return getOptimizedImageUrl(photoUrl, sizeMap[context] || ImageSizes.PLAYER_CARD);
};

/**
 * Get team logo with appropriate quality
 */
export const getTeamLogo = (logoUrl, size = 'medium') => {
  const sizeMap = {
    'small': ImageSizes.TEAM_LOGO_SMALL,
    'medium': ImageSizes.TEAM_LOGO_MEDIUM,
    'large': ImageSizes.TEAM_LOGO_LARGE,
  };
  
  return getOptimizedImageUrl(logoUrl, sizeMap[size] || ImageSizes.TEAM_LOGO_MEDIUM);
};

/**
 * Helper to get image URL with fallback support
 */
export const getImageWithFallback = (imageUrl, fallbackUrl, cloudinaryOptions = null) => {
  if (!imageUrl || imageUrl.trim() === '' || imageUrl.includes('placeholder')) {
    return fallbackUrl;
  }
  
  // If it's a Cloudinary URL and we have options, transform it
  if (cloudinaryOptions && imageUrl.includes('res.cloudinary.com')) {
    return transformCloudinaryImage(imageUrl, cloudinaryOptions);
  }
  
  return imageUrl;
};
