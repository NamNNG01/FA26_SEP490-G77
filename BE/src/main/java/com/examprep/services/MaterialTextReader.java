package com.examprep.services;

import com.examprep.exceptions.BadRequestException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;
import org.w3c.dom.Node;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.Locale;
import java.util.zip.ZipInputStream;

@Component
public class MaterialTextReader {
    private static final int LIMIT=20*1024*1024;
    private static final int TEXT_LIMIT=1_000_000;

    public enum ReadErrorKind {
        EMPTY_OR_TOO_LARGE_FILE,
        UNSUPPORTED_FORMAT,
        INVALID_FILE,
        PDF_PROTECTED,
        PDF_TOO_LARGE,
        PDF_NO_TEXT_LAYER,
        TEXT_TOO_LARGE,
        READ_FAILED
    }

    public static class MaterialReadException extends BadRequestException {
        private final ReadErrorKind kind;

        public MaterialReadException(ReadErrorKind kind, String message) {
            super(message);
            this.kind = kind;
        }

        public ReadErrorKind getKind() {
            return kind;
        }
    }

    public String read(String filename,byte[] bytes) {
        if(bytes==null || bytes.length==0 || bytes.length>LIMIT) throw err(ReadErrorKind.EMPTY_OR_TOO_LARGE_FILE, "File must contain data and be at most 20MB.");
        String name=filename==null?"":filename.toLowerCase(Locale.ROOT);
        try {
            String text;
            if(name.endsWith(".txt")) {
                text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                if(text.indexOf('\0')>=0) throw err(ReadErrorKind.INVALID_FILE, "TXT must contain UTF-8 text.");
            } else if(name.endsWith(".pdf")) {
                if(bytes.length<5 || !new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")) throw err(ReadErrorKind.INVALID_FILE, "Invalid PDF file.");
                try(var document=Loader.loadPDF(bytes)) {
                    if(document.getNumberOfPages()>500) throw err(ReadErrorKind.PDF_TOO_LARGE, "PDF is too large or does not allow text extraction.");
                    if(!document.getCurrentAccessPermission().canExtractContent()) throw err(ReadErrorKind.PDF_PROTECTED, "PDF is too large or does not allow text extraction.");
                    StringBuilder result=new StringBuilder(); PDFTextStripper stripper=new PDFTextStripper();
                    for(int page=1;page<=document.getNumberOfPages();page++) {
                        stripper.setStartPage(page); stripper.setEndPage(page); result.append(stripper.getText(document));
                        if(result.length()>TEXT_LIMIT) throw err(ReadErrorKind.PDF_TOO_LARGE, "Extracted text is too large.");
                    }
                    text=result.toString();
                } catch (InvalidPasswordException ex) {
                    throw err(ReadErrorKind.PDF_PROTECTED, "Could not extract text from this file. Use a valid, unencrypted PDF, DOCX or UTF-8 TXT file.");
                }
            } else if(name.endsWith(".docx")) text=docx(bytes);
            else throw err(ReadErrorKind.UNSUPPORTED_FORMAT, "Supported files: pdf, docx and txt.");
            text=text.replace("\uFEFF", "").strip();
            if(text.isEmpty()) {
                throw err(name.endsWith(".pdf") ? ReadErrorKind.PDF_NO_TEXT_LAYER : ReadErrorKind.READ_FAILED,
                        "File must contain readable text (at most 1,000,000 characters).");
            }
            if(text.length()>TEXT_LIMIT) {
                throw err(name.endsWith(".pdf") ? ReadErrorKind.PDF_TOO_LARGE : ReadErrorKind.TEXT_TOO_LARGE,
                        "File must contain readable text (at most 1,000,000 characters).");
            }
            return text;
        } catch(MaterialReadException ex) { throw ex; }
        catch(BadRequestException ex) { throw ex; }
        catch(Exception ex) {
            throw err(name.endsWith(".pdf") ? ReadErrorKind.INVALID_FILE : ReadErrorKind.READ_FAILED,
                    "Could not extract text from this file. Use a valid, unencrypted PDF, DOCX or UTF-8 TXT file.");
        }
    }

    /** Page count of a PDF upload; DOCX has no stable page count, so callers get {@code null}. */
    public Integer pageCount(String filename,byte[] bytes) {
        if(filename==null || !filename.toLowerCase(Locale.ROOT).endsWith(".pdf")) return null;
        try(var document=Loader.loadPDF(bytes)) { return document.getNumberOfPages(); }
        catch(Exception ex) { return null; }
    }

    private String docx(byte[] bytes) throws Exception {
        byte[] document=null; boolean contentTypes=false; int total=0,entries=0;
        try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for(var entry=zip.getNextEntry();entry!=null;entry=zip.getNextEntry()) {
                if(++entries>1000) throw bad("DOCX contains too many entries.");
                ByteArrayOutputStream selected=entry.getName().equals("word/document.xml")?new ByteArrayOutputStream():null;
                byte[] buffer=new byte[8192]; int count;
                while((count=zip.read(buffer))!=-1) {
                    total+=count; if(total>LIMIT*2) throw bad("Expanded DOCX is too large.");
                    if(selected!=null) selected.write(buffer,0,count);
                }
                if(selected!=null) document=selected.toByteArray();
                if(entry.getName().equals("[Content_Types].xml")) contentTypes=true;
            }
        }
        if(document==null || !contentTypes) throw bad("Invalid DOCX file.");
        DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true); factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
        factory.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_DTD,"");
        factory.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
        factory.setXIncludeAware(false); factory.setExpandEntityReferences(false);
        var xml=factory.newDocumentBuilder().parse(new ByteArrayInputStream(document));
        var paragraphs=xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main","p");
        StringBuilder text=new StringBuilder();
        for(int i=0;i<paragraphs.getLength();i++) { appendText(paragraphs.item(i),text); text.append('\n'); }
        return text.toString();
    }
    private void appendText(Node node,StringBuilder text) {
        if("t".equals(node.getLocalName())) text.append(node.getTextContent());
        else if("br".equals(node.getLocalName()) || "tab".equals(node.getLocalName())) text.append(' ');
        else for(Node child=node.getFirstChild();child!=null;child=child.getNextSibling()) appendText(child,text);
    }
    private BadRequestException bad(String message) { return new BadRequestException(message); }
    private MaterialReadException err(ReadErrorKind kind, String message) { return new MaterialReadException(kind, message); }
}
