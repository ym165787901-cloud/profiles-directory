import { el, imgUrl } from './lib.js';

const deleteButton = (item, onDelete) =>
  onDelete ? [el('button', { class: 'btn danger sm', onclick: () => onDelete(item) }, 'Delete')] : [];

/** Shared by the public page (read-only) and the dashboard (pass onDelete). */
export const profileCard = (profile, index, onDelete) =>
  el('article', { class: 'card', style: `--i:${index}` },
    el('img', { src: imgUrl(profile.image), alt: profile.name, loading: 'lazy' }),
    el('h3', { dir: 'auto' }, profile.name),
    ...deleteButton(profile, onDelete));

export const galleryTile = (image, index, { onOpen, onDelete } = {}) =>
  el('figure', { class: 'tile', style: `--i:${index}` },
    el('img', { src: imgUrl(image.image), alt: 'Gallery image', loading: 'lazy', onclick: () => onOpen?.(image) }),
    ...deleteButton(image, onDelete));

export const renderList = (container, items, factory, emptyMessage) =>
  container.replaceChildren(...(items.length ? items.map(factory) : [el('p', { class: 'empty' }, emptyMessage)]));
