import type { AspectRatio } from '../constants';

/** Fill-in-the-blank prompt templates for common ad shots. Slots look like {product}. */
export interface PromptRecipe {
  id: string;
  title: string;
  kind: 'video' | 'image';
  category: 'Product' | 'UGC' | 'Lifestyle' | 'Promo' | 'Food & drink' | 'Beauty' | 'Fashion' | 'Tech & apps' | 'Cinematic';
  description: string;
  template: string;
  slots: { key: string; label: string; placeholder: string }[];
  aspect: AspectRatio;
  durationS?: number;
}

const product = { key: 'product', label: 'Product', placeholder: 'matte black water bottle' };
const setting = { key: 'setting', label: 'Setting', placeholder: 'sunlit kitchen counter' };
const person = { key: 'person', label: 'Person', placeholder: 'woman in her late 20s, casual hoodie' };
const color = { key: 'color', label: 'Brand color', placeholder: 'electric violet' };

export const PROMPT_RECIPES: PromptRecipe[] = [
  {
    id: 'hero-orbit',
    title: 'Hero orbit',
    kind: 'video',
    category: 'Product',
    description: 'Slow 180° orbit around the product on a seamless backdrop.',
    template: 'Slow 180-degree orbit around a {product} standing on a seamless {color} backdrop, soft key light from the left, rim light tracing the edges, subtle floor reflection, shallow depth of field, premium commercial look, ends on a clean front-facing hero angle.',
    slots: [product, color],
    aspect: '9:16',
    durationS: 6,
  },
  {
    id: 'ugc-selfie-review',
    title: 'Selfie review',
    kind: 'video',
    category: 'UGC',
    description: 'Handheld front-camera testimonial, natural light, real-life feel.',
    template: 'Handheld front-facing phone video of a {person} in their {setting}, holding a {product} up to the camera and smiling while talking about it, natural window light, slight camera shake, authentic creator style, no studio lighting, no text on screen.',
    slots: [person, setting, product],
    aspect: '9:16',
    durationS: 8,
  },
  {
    id: 'unboxing-pov',
    title: 'Unboxing POV',
    kind: 'video',
    category: 'UGC',
    description: 'First-person hands opening the package.',
    template: 'First-person POV of hands opening a shipping box on a {setting}, peeling back tissue paper to reveal a {product}, lifting it toward the camera, tactile close-ups, warm natural light, satisfying ASMR-style pacing.',
    slots: [setting, product],
    aspect: '9:16',
    durationS: 7,
  },
  {
    id: 'before-after',
    title: 'Before / after',
    kind: 'video',
    category: 'Promo',
    description: 'A split moment that shows the problem, then the fix.',
    template: 'A {setting} that looks {problem}; a hand places a {product} in frame and the scene transforms into {result}, smooth morph transition, crisp detail, bright commercial grade.',
    slots: [setting, { key: 'problem', label: 'Problem', placeholder: 'cluttered and dull' }, product, { key: 'result', label: 'Result', placeholder: 'tidy, bright and calm' }],
    aspect: '9:16',
    durationS: 6,
  },
  {
    id: 'ingredient-burst',
    title: 'Ingredient burst',
    kind: 'video',
    category: 'Food & drink',
    description: 'Ingredients fly in and assemble around the product.',
    template: 'High-speed macro shot: {ingredients} burst into frame in slow motion and swirl around a {product}, droplets catching the light, dark moody background, glossy highlights, ends with the product centered and still.',
    slots: [{ key: 'ingredients', label: 'Ingredients', placeholder: 'sliced oranges, mint leaves and ice cubes' }, product],
    aspect: '9:16',
    durationS: 5,
  },
  {
    id: 'pour-shot',
    title: 'Hero pour',
    kind: 'video',
    category: 'Food & drink',
    description: 'Slow-motion pour with condensation and backlight.',
    template: 'Slow-motion pour of {drink} into a glass beside a {product}, backlit so the liquid glows, condensation on the glass, bokeh lights behind, macro lens, appetizing commercial look.',
    slots: [{ key: 'drink', label: 'Drink', placeholder: 'iced cold brew' }, product],
    aspect: '9:16',
    durationS: 5,
  },
  {
    id: 'skincare-texture',
    title: 'Texture swatch',
    kind: 'video',
    category: 'Beauty',
    description: 'Macro texture swipe on glass with clean light.',
    template: 'Extreme macro of {texture} being swiped across clear glass next to a {product}, creamy texture detail, soft diffused light, pastel {color} background, clean minimal beauty-ad aesthetic.',
    slots: [{ key: 'texture', label: 'Texture', placeholder: 'a pearl-white moisturizer' }, product, color],
    aspect: '4:5',
    durationS: 5,
  },
  {
    id: 'outfit-walk',
    title: 'Street walk',
    kind: 'video',
    category: 'Fashion',
    description: 'Tracking shot of a model walking toward camera.',
    template: 'Tracking shot of a {person} walking toward the camera down a {setting}, wearing {product}, golden-hour light, fabric moving naturally, confident stride, editorial fashion film look.',
    slots: [person, setting, product],
    aspect: '9:16',
    durationS: 6,
  },
  {
    id: 'app-screen-hands',
    title: 'App in hand',
    kind: 'video',
    category: 'Tech & apps',
    description: 'Phone in hand with the app on screen, gentle push-in.',
    template: 'Close-up of hands holding a phone showing {screen} on its screen, thumb scrolling, gentle push-in, {setting} softly blurred behind, modern and clean, realistic reflections on the glass.',
    slots: [{ key: 'screen', label: 'On screen', placeholder: 'a budgeting app dashboard' }, setting],
    aspect: '9:16',
    durationS: 5,
  },
  {
    id: 'cinematic-reveal',
    title: 'Cinematic reveal',
    kind: 'video',
    category: 'Cinematic',
    description: 'Dramatic light sweep reveals the product from darkness.',
    template: 'Pitch-black scene; a slow beam of light sweeps across and reveals a {product}, haze in the air, anamorphic lens flare, deep shadows, epic and premium, ends on the product glowing softly.',
    slots: [product],
    aspect: '16:9',
    durationS: 6,
  },
  {
    id: 'flash-sale',
    title: 'Flash sale energy',
    kind: 'video',
    category: 'Promo',
    description: 'Fast, punchy motion for limited-time offers.',
    template: 'Energetic fast-cut style shot of a {product} spinning onto a {color} background, confetti bursts, quick zooms and whip pans, bold high-contrast lighting, festive sale mood, leave clean space at the top for a headline.',
    slots: [product, color],
    aspect: '9:16',
    durationS: 4,
  },
  {
    id: 'lifestyle-morning',
    title: 'Morning routine',
    kind: 'video',
    category: 'Lifestyle',
    description: 'Soft daily-life moment featuring the product.',
    template: 'Soft morning light in a {setting}; a {person} reaches for a {product} as part of their routine, steam from a coffee mug, calm and cozy atmosphere, natural colors, gentle handheld movement.',
    slots: [setting, person, product],
    aspect: '9:16',
    durationS: 7,
  },
  {
    id: 'studio-packshot',
    title: 'Studio packshot',
    kind: 'image',
    category: 'Product',
    description: 'Clean e-commerce hero still.',
    template: 'Studio packshot of a {product} centered on a seamless {color} background, soft gradient lighting, crisp shadow underneath, sharp focus, high-end e-commerce photography, no text.',
    slots: [product, color],
    aspect: '1:1',
  },
  {
    id: 'flat-lay',
    title: 'Flat lay',
    kind: 'image',
    category: 'Lifestyle',
    description: 'Top-down styled arrangement with props.',
    template: 'Top-down flat lay of a {product} surrounded by {props} on a {surface}, balanced composition, soft daylight, natural shadows, lifestyle magazine styling.',
    slots: [product, { key: 'props', label: 'Props', placeholder: 'eucalyptus sprigs, a linen towel and a ceramic dish' }, { key: 'surface', label: 'Surface', placeholder: 'warm travertine stone' }],
    aspect: '4:5',
  },
  {
    id: 'in-context',
    title: 'In-context scene',
    kind: 'image',
    category: 'Lifestyle',
    description: 'The product placed naturally into a real setting.',
    template: 'Photorealistic photo of a {product} on a {setting}, natural light from a nearby window, everyday props around it, realistic scale and reflections, candid lifestyle feel, shot on a 35mm lens.',
    slots: [product, setting],
    aspect: '4:5',
  },
  {
    id: 'model-holding',
    title: 'Model holding product',
    kind: 'image',
    category: 'UGC',
    description: 'A person showing the product, creator-style.',
    template: 'Candid photo of a {person} holding a {product} near their face and smiling, {setting} behind them, natural skin texture, phone-camera look, warm tones, authentic social-media style.',
    slots: [person, product, setting],
    aspect: '9:16',
  },
  {
    id: 'promo-banner',
    title: 'Promo backdrop',
    kind: 'image',
    category: 'Promo',
    description: 'Bold backdrop with room for headline text.',
    template: 'Bold promotional image of a {product} on the lower third of the frame, dynamic {color} gradient background with abstract shapes, dramatic lighting, large empty area at the top for a headline, no text.',
    slots: [product, color],
    aspect: '9:16',
  },
  {
    id: 'food-hero',
    title: 'Food hero',
    kind: 'image',
    category: 'Food & drink',
    description: 'Appetizing close-up with steam and texture.',
    template: 'Close-up of {dish} with visible steam and glossy texture, garnished with {garnish}, on a rustic table, dark moody background, side light, shallow depth of field, mouth-watering food photography.',
    slots: [{ key: 'dish', label: 'Dish', placeholder: 'a stack of buttermilk pancakes' }, { key: 'garnish', label: 'Garnish', placeholder: 'berries and maple syrup' }],
    aspect: '4:5',
  },
  {
    id: 'beauty-closeup',
    title: 'Beauty close-up',
    kind: 'image',
    category: 'Beauty',
    description: 'Glowing skin close-up with the product.',
    template: 'Beauty close-up of a {person} with glowing dewy skin applying {product}, soft ring-light catchlights, pastel {color} background, clean and luminous, high-end beauty campaign look.',
    slots: [person, product, color],
    aspect: '4:5',
  },
  {
    id: 'composite-scene',
    title: 'Composite: product into scene',
    kind: 'image',
    category: 'Product',
    description: 'Attach a product photo and a scene; blend them naturally.',
    template: 'Place the product from @image1 onto the {surface} in @image2, match the lighting, perspective and shadows of the scene, keep the product label sharp and unchanged, photorealistic.',
    slots: [{ key: 'surface', label: 'Where', placeholder: 'wooden table on the left' }],
    aspect: '4:5',
  },
];

export const PROMPT_RECIPES_BY_ID: Record<string, PromptRecipe> = Object.fromEntries(PROMPT_RECIPES.map((r) => [r.id, r]));

/** Fills {slot} placeholders; empty slots fall back to their example text. */
export function fillRecipe(recipe: PromptRecipe, values: Record<string, string>): string {
  return recipe.template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = values[key]?.trim();
    return v || recipe.slots.find((s) => s.key === key)?.placeholder || key;
  });
}
