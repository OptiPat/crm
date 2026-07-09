export type NotePrintSection = {
  heading?: string;
  meta?: string;
  contentHtml: string;
};

export type NotePrintDocument = {
  title: string;
  subtitle?: string;
  sections: NotePrintSection[];
};
