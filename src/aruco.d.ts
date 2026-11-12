declare module 'js-aruco2' {
  const AR: {
    Detector: new (options?: { dictionaryName: string }) => {
      grey:{data:number[]};thres:{data:number[]};binary:number[];
      detect(image: ImageData): { id: number; corners: { x: number; y: number }[] }[];
    };
    Dictionary: new (name: string) => { generateSVG(id: number): string };
  };
  const Aruco: { AR: typeof AR };
  export default Aruco;
}
