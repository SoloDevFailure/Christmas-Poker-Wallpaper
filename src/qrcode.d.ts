declare module 'qrcode' {
    const QRCode: {
        toDataURL(text: string, options: {
            width: number;
            margin: number;
            errorCorrectionLevel: 'M';
        }): Promise<string>;
    };
    export default QRCode;
}
