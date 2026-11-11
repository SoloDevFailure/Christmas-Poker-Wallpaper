import Aruco from 'js-aruco2';
const { AR } = Aruco;
const detector = new AR.Detector({ dictionaryName: 'ARUCO' });
self.onmessage = (event: MessageEvent<{
    buffer: ArrayBuffer;
    width: number;
    height: number;
    at: number;
    epoch: number;
}>) => {
    try {
        const { buffer, width, height, at, epoch } = event.data;
        const found = detector.detect(new ImageData(new Uint8ClampedArray(buffer), width, height));
        self.postMessage({ found, at, width, height, epoch });
    }
    catch (e) {
        self.postMessage({ error: String(e) });
    }
};
