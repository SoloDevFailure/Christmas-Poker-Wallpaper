export const MAX_TEXT_LENGTH = 160, MAX_TEXT_LINES = 4, MAX_IMAGE_WIDTH = 512, MAX_IMAGE_HEIGHT = 256, MAX_IMAGE_DATA_LENGTH = 65536;
export type CustomAsset = {
    image_data: string;
    image_width: number;
    image_height: number;
};
export function validateText(input: string) {
    const text = input.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    if (!text.trim())
        throw Error('Enter some text or an emoji.');
    if (text.length > MAX_TEXT_LENGTH)
        throw Error('Keep the stamp to ' + MAX_TEXT_LENGTH + ' characters.');
    if (text.split('\n').length > MAX_TEXT_LINES)
        throw Error('Use up to ' + MAX_TEXT_LINES + ' lines.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
        throw Error('The text contains unsupported control characters.');
    return text;
}
export function graphemes(text: string): string[] {
    if (typeof Intl.Segmenter === 'function')
        return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment);
    return Array.from(text);
}
export function layoutText(input: string, measure: (text: string, fontSize: number) => number) {
    const text = validateText(input), padding = 12;
    for (let fontSize = 44; fontSize >= 10; fontSize -= 2) {
        const lines: string[] = [];
        for (const paragraph of text.split('\n')) {
            let line = '';
            for (const glyph of graphemes(paragraph)) {
                if (line && measure(line + glyph, fontSize) > MAX_IMAGE_WIDTH - padding * 2) {
                    lines.push(line);
                    line = glyph;
                }
                else
                    line += glyph;
            }
            lines.push(line);
        }
        const lineHeight = Math.ceil(fontSize * 1.4), width = Math.max(1, Math.ceil(Math.max(...lines.map(l => measure(l, fontSize)))) + padding * 2), height = lines.length * lineHeight + padding * 2;
        if (width <= MAX_IMAGE_WIDTH && height <= MAX_IMAGE_HEIGHT)
            return { lines, fontSize, lineHeight, width, height, padding };
    }
    throw Error('This text will not fit. Try fewer characters or lines.');
}
export function validCustomAsset(asset: {
    image_data?: string | null;
    image_width?: number | null;
    image_height?: number | null;
}): boolean {
    const { image_data: data, image_width: width, image_height: height } = asset;
    if (typeof data !== 'string' || data.length > MAX_IMAGE_DATA_LENGTH || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data) || typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || width > MAX_IMAGE_WIDTH || height < 1 || height > MAX_IMAGE_HEIGHT)
        return false;
    try {
        const bytes = atob(data.slice(22));
        if (bytes.length < 45 || [137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => bytes.charCodeAt(i) !== n) || bytes.slice(12, 16) !== 'IHDR')
            return false;
        const uint = (i: number) => [0, 1, 2, 3].reduce((s, j) => s * 256 + bytes.charCodeAt(i + j), 0);
        return uint(16) === width && uint(20) === height;
    }
    catch {
        return false;
    }
}
export async function rasterizeText(input: string): Promise<CustomAsset> {
    // Wait for the platform's normal font/emoji rendering before capturing pixels.
    await document.fonts?.ready;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!ctx)
        throw Error('This browser cannot create a text stamp.');
    const font = (size: number) => size + 'px system-ui, -apple-system, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    const layout = layoutText(input, (text, size) => { ctx.font = font(size); return ctx.measureText(text).width; });
    canvas.width = layout.width;
    canvas.height = layout.height;
    ctx.font = font(layout.fontSize);
    ctx.fillStyle = '#fff8e1';
    ctx.textBaseline = 'alphabetic';
    layout.lines.forEach((line, i) => ctx.fillText(line, layout.padding, layout.padding + layout.fontSize + i * layout.lineHeight));
    for (let attempt = 0; attempt < 6; attempt++) {
        const factor = Math.pow(.8, attempt), output = document.createElement('canvas');
        output.width = Math.max(1, Math.round(canvas.width * factor));
        output.height = Math.max(1, Math.round(canvas.height * factor));
        output.getContext('2d')!.drawImage(canvas, 0, 0, output.width, output.height);
        const image_data = output.toDataURL('image/png');
        const asset = { image_data, image_width: output.width, image_height: output.height };
        if (validCustomAsset(asset))
            return asset;
    }
    throw Error('The image is too detailed. Try fewer emojis or less text.');
}
