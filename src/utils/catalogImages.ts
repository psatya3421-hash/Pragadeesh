import obstacleAvoidingImg from '../assets/images/obstacle_avoiding_kit_1794708589462.jpg';
import humanFollowerImg from '../assets/images/human_follower_kit_1794708590281.jpg';
import companyWebpageImg from '../assets/images/company_webpage_service_1794708590660.jpg';
import otherIdeasImg from '../assets/images/custom_innovation_ideas_1794708590798.jpg';

const DEFAULT_ASSET_IMAGE_MAP: Record<string, string> = {
  '/src/assets/images/obstacle_avoiding_kit_1794708589462.jpg': obstacleAvoidingImg,
  '/src/assets/images/human_follower_kit_1794708590281.jpg': humanFollowerImg,
  '/src/assets/images/company_webpage_service_1794708590660.jpg': companyWebpageImg,
  '/src/assets/images/custom_innovation_ideas_1794708590798.jpg': otherIdeasImg,
};

export function resolveCatalogImageUrl(imageUrl?: string): string {
  const clean = (imageUrl || '').trim();
  if (!clean) return '';
  return DEFAULT_ASSET_IMAGE_MAP[clean] || clean;
}
