export interface Page {
	id:        string;        // 'p_' + Date.now()
	title:     string;
	content:   string;        // raw markdown
	parentId:  string | null;
	createdAt: string;        // ISO 8601
	updatedAt: string;        // ISO 8601
}

export type PagesMap = Map<string, Page>;
