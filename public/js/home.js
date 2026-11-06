import { api, imgUrl } from './lib.js';
import { profileCard, galleryTile, renderList } from './components.js';

const lightbox = document.getElementById('lightbox');
lightbox.addEventListener('click', () => lightbox.close());
const openImage = (image) => {
  lightbox.querySelector('img').src = imgUrl(image.image);
  lightbox.showModal();
};

try {
  const [profiles, gallery] = await Promise.all([api('/api/profiles'), api('/api/gallery')]);
  renderList(document.getElementById('profileGrid'), profiles, (p, i) => profileCard(p, i), 'No profiles yet. Check back soon.');
  renderList(document.getElementById('galleryGrid'), gallery, (g, i) => galleryTile(g, i, { onOpen: openImage }), 'The gallery is empty for now.');
} catch (err) {
  console.error(err);
}
