import { describe, expect, it } from 'vitest';
import { carriedCredits, creditsCaption, creditsFor, mergeCredits, missingCredits, openverseItem, pexelsPhoto, pexelsVideo, pickVideoFile, pixabayPhoto, pixabayVideo, publicStockItem, stockSearchSchema } from './stock';

describe('stock providers', () => {
  it('reads a Pexels photo', () => {
    const item = pexelsPhoto({ id: 2014422, width: 3024, height: 3024, url: 'https://www.pexels.com/photo/coffee-2014422/', photographer: 'Joey Farina', photographer_url: 'https://www.pexels.com/@joey', alt: 'Cup of coffee', src: { original: 'https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg', medium: 'https://images.pexels.com/photos/2014422/m.jpeg' } });
    expect(item).toMatchObject({ provider: 'pexels', id: '2014422', kind: 'photo', title: 'Cup of coffee', creator: 'Joey Farina', license: 'pexels', credit: null, ext: 'jpeg', thumbUrl: 'https://images.pexels.com/photos/2014422/m.jpeg' });
    expect(pexelsPhoto({ id: 1 })).toBeNull();
  });

  it('picks a full HD Pexels video file and a small preview', () => {
    const item = pexelsVideo({
      id: 857251,
      url: 'https://www.pexels.com/video/clouds-over-the-sea-857251/',
      duration: 12,
      image: 'https://images.pexels.com/videos/857251/pictures/preview-0.jpg',
      user: { name: 'Pixabay', url: 'https://www.pexels.com/@pixabay' },
      video_files: [
        { id: 1, quality: 'uhd', file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://videos.pexels.com/4k.mp4' },
        { id: 2, quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/hd.mp4' },
        { id: 3, quality: 'sd', file_type: 'video/mp4', width: 640, height: 360, link: 'https://videos.pexels.com/sd.mp4' },
        { id: 4, quality: 'hls', file_type: 'application/x-mpegURL', width: null, height: null, link: 'https://videos.pexels.com/x.m3u8' },
      ],
    });
    expect(item).toMatchObject({ title: 'Clouds over the sea', downloadUrl: 'https://videos.pexels.com/hd.mp4', previewUrl: 'https://videos.pexels.com/sd.mp4', width: 1920, height: 1080, durationS: 12, ext: 'mp4' });
  });

  it('chooses the smallest file above 1080p when nothing smaller exists', () => {
    expect(pickVideoFile([{ width: 3840, height: 2160 }, { width: 2560, height: 1440 }])).toEqual({ width: 2560, height: 1440 });
    expect(pickVideoFile([{ width: 1080, height: 1920 }, { width: 720, height: 1280 }])).toEqual({ width: 1080, height: 1920 });
  });

  it('reads Pixabay photos and videos', () => {
    expect(pixabayPhoto({ id: 195893, pageURL: 'https://pixabay.com/en/blossom-195893/', tags: 'blossom, bloom, flower', webformatURL: 'https://pixabay.com/get/w.jpg', largeImageURL: 'https://pixabay.com/get/l.jpg', imageWidth: 4000, imageHeight: 2250, user: 'Josch13', user_id: 48777 })).toMatchObject({
      title: 'Blossom, bloom, flower',
      downloadUrl: 'https://pixabay.com/get/l.jpg',
      creatorUrl: 'https://pixabay.com/users/Josch13-48777/',
      license: 'pixabay',
    });
    const v = pixabayVideo({ id: 125, pageURL: 'https://pixabay.com/videos/id-125/', tags: 'flowers, yellow', duration: 12, user: 'CoverrFree', user_id: 1281706, videos: { large: { url: 'https://cdn.pixabay.com/l.mp4', width: 1920, height: 1080, thumbnail: 'https://cdn.pixabay.com/l.jpg' }, tiny: { url: 'https://cdn.pixabay.com/t.mp4', width: 640, height: 360 } } });
    expect(v).toMatchObject({ downloadUrl: 'https://cdn.pixabay.com/l.mp4', previewUrl: 'https://cdn.pixabay.com/t.mp4', thumbUrl: 'https://cdn.pixabay.com/l.jpg' });
  });

  it('keeps only Openverse licenses that allow ads, with the credit a CC BY license needs', () => {
    const base = { id: 'f9384235-b72e-4f1e-9b05-e1b116262a29', title: 'Waves', creator: 'Ann', url: 'https://live.staticflickr.com/1/waves.jpg', foreign_landing_url: 'https://www.flickr.com/photos/ann/1', source: 'flickr', width: 1200, height: 800, thumbnail: 'https://api.openverse.org/v1/images/f9/thumb/' };
    expect(openverseItem({ ...base, license: 'cc0' }, 'photo')).toMatchObject({ license: 'cc0', credit: null, ext: 'jpg' });
    expect(openverseItem({ ...base, license: 'by', license_version: '2.0', attribution: '"Waves" by Ann is licensed under CC BY 2.0.' }, 'photo')?.credit).toBe('"Waves" by Ann is licensed under CC BY 2.0.');
    expect(openverseItem({ ...base, license: 'by', license_version: '2.0' }, 'photo')?.credit).toBe('“Waves” by Ann (flickr), Creative Commons Attribution 2.0');
    for (const license of ['by-sa', 'by-nc', 'by-nd', 'by-nc-sa', 'sampling+']) expect(openverseItem({ ...base, license }, 'photo')).toBeNull();
    expect(openverseItem({ ...base, license: 'cc0', mature: true }, 'photo')).toBeNull();
    expect(openverseItem({ ...base, license: 'pdm', duration: 93500, filetype: 'mp3' }, 'music')).toMatchObject({ durationS: 93.5, previewUrl: base.url, ext: 'mp3' });
  });

  it('never sends the download address to the browser', () => {
    const item = pexelsPhoto({ id: 1, url: 'https://www.pexels.com/photo/x-1/', src: { original: 'https://images.pexels.com/1.jpeg' } })!;
    expect(publicStockItem(item)).not.toHaveProperty('downloadUrl');
  });

  it('parses search input and builds credits', () => {
    expect(stockSearchSchema.parse({ kind: 'photo', q: ' coffee ', credit: 'true', page: '2' })).toMatchObject({ q: 'coffee', credit: true, page: 2 });
    expect(stockSearchSchema.safeParse({ kind: 'photo', q: '' }).success).toBe(false);
    expect(creditsFor([{ attribution: 'A' }, { attribution: null }, { attribution: 'A' }, { attribution: 'B' }])).toEqual(['A', 'B']);
    expect(creditsCaption(['A'])).toBe('Credit: A');
    expect(creditsCaption(['A', 'B'])).toBe('Credits:\n• A\n• B');
  });
});

describe('credits', () => {
  it('carries, merges and finds missing credit lines', () => {
    expect(carriedCredits({ credits: [' “Sun” by Ana, CC BY 4.0 ', 7, ''] })).toEqual(['“Sun” by Ana, CC BY 4.0']);
    expect(carriedCredits(null)).toEqual([]);
    expect(mergeCredits(['a', 'b'], null, ['b', 'c'])).toEqual(['a', 'b', 'c']);
    const credits = ['“Sun” by Ana, CC BY 4.0', '“Rain” by Bo, CC BY 3.0'];
    expect(missingCredits(credits, 'Great day! Credit: "Sun" by Ana,  CC BY 4.0')).toEqual(['“Rain” by Bo, CC BY 3.0']);
    expect(missingCredits(credits, creditsCaption(credits))).toEqual([]);
  });
});
