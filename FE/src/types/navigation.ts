import React from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  section?: string;
  page?: string;
  showInNav?: boolean;
}

export interface NavSectionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface NavSection {
  id: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  items: NavSectionItem[];
}

export interface UserContext {
  name: string;
  role: string;
}
