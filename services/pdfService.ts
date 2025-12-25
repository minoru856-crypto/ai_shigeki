
interface PdfJs {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (config: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNum: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str: string }>;
        }>;
      }>;
    }>;
  };
}

declare const pdfjsLib: PdfJs;

export const extractTextFromPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
};
