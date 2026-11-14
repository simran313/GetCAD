#!/usr/bin/env python3
"""
Builds the branded Word template (reference.docx) that pandoc uses for the
handbook's DOCX: black-and-white type, Arial (present on every Word install),
numbered heading styles that start each chapter on a new page, bordered
tables with a grey header row, A4 pages, and a running header and a footer
with "Page X of Y".

  python3 docs/document-generation/make_reference_docx.py
  -> docs/document-sources/reference.docx

It starts from pandoc's own default reference document (so every style pandoc
writes exists) and edits its XML. Run it again after changing a style here.
"""
import os
import re
import subprocess
import tempfile
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "document-sources", "reference.docx")
FONT = "Arial"
INK = "0A0A0A"
MUTED = "525252"
RULE = "D4D4D4"

FONTS = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:eastAsia="{FONT}" w:cs="{FONT}" />'


def style_block(styles: str, sid: str) -> tuple[int, int]:
    m = re.search(r'<w:style [^>]*w:styleId="%s".*?</w:style>' % sid, styles, re.S)
    if not m:
        raise SystemExit(f"style {sid} not found in pandoc's reference.docx")
    return m.start(), m.end()


def set_rpr(styles: str, sid: str, rpr: str) -> str:
    a, b = style_block(styles, sid)
    block = styles[a:b]
    block = re.sub(r"<w:rPr>.*?</w:rPr>", "", block, flags=re.S)
    block = block.replace("</w:style>", f"<w:rPr>{rpr}</w:rPr></w:style>")
    return styles[:a] + block + styles[b:]


def set_ppr(styles: str, sid: str, ppr: str) -> str:
    a, b = style_block(styles, sid)
    block = styles[a:b]
    block = re.sub(r"<w:pPr>.*?</w:pPr>", "", block, flags=re.S)
    block = re.sub(r"(<w:qFormat />|<w:unhideWhenUsed />|<w:uiPriority [^>]*/>|<w:next [^>]*/>|<w:basedOn [^>]*/>)(?!.*(<w:qFormat />|<w:unhideWhenUsed />|<w:uiPriority [^>]*/>|<w:next [^>]*/>|<w:basedOn [^>]*/>))", r"\1<w:pPr>%s</w:pPr>" % ppr.replace("\\", "\\\\"), block, count=1, flags=re.S)
    return styles[:a] + block + styles[b:]


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = os.path.join(tmp, "base.docx")
        with open(base, "wb") as fh:
            fh.write(subprocess.check_output(["pandoc", "--print-default-data-file", "reference.docx"]))
        with zipfile.ZipFile(base) as z:
            files = {n: z.read(n) for n in z.namelist() if not n.endswith("/")}

    styles = files["word/styles.xml"].decode("utf-8")
    # Body defaults: Arial 10pt, near-black, 1.25 line spacing.
    styles = re.sub(r"<w:rPrDefault>.*?</w:rPrDefault>",
                    f'<w:rPrDefault><w:rPr>{FONTS}<w:color w:val="1F1F1F" /><w:sz w:val="20" /><w:szCs w:val="20" /><w:lang w:val="en-GB" w:eastAsia="en-US" w:bidi="ar-SA" /></w:rPr></w:rPrDefault>',
                    styles, flags=re.S)
    styles = re.sub(r"<w:pPrDefault>.*?</w:pPrDefault>",
                    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto" /></w:pPr></w:pPrDefault>',
                    styles, flags=re.S)
    styles = set_ppr(styles, "BodyText", '<w:spacing w:before="60" w:after="120" />')
    styles = set_ppr(styles, "Compact", '<w:spacing w:before="20" w:after="20" />')

    styles = set_ppr(styles, "Title", '<w:keepNext /><w:spacing w:before="2400" w:after="240" />')
    styles = set_rpr(styles, "Title", f'{FONTS}<w:b /><w:color w:val="{INK}" /><w:sz w:val="60" /><w:szCs w:val="60" />')
    styles = set_ppr(styles, "Subtitle", '<w:keepNext /><w:spacing w:before="0" w:after="480" />')
    styles = set_rpr(styles, "Subtitle", f'{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="30" /><w:szCs w:val="30" />')
    styles = set_ppr(styles, "Author", '<w:spacing w:before="0" w:after="60" />')
    styles = set_rpr(styles, "Author", f'{FONTS}<w:b /><w:color w:val="{INK}" /><w:sz w:val="22" />')
    styles = set_ppr(styles, "Date", '<w:spacing w:before="0" w:after="60" />')
    styles = set_rpr(styles, "Date", f'{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="20" />')
    styles = set_ppr(styles, "AbstractTitle", '<w:keepNext /><w:jc w:val="left" /><w:spacing w:before="1200" w:after="60" />')
    styles = set_rpr(styles, "AbstractTitle", f'{FONTS}<w:b /><w:caps /><w:color w:val="{MUTED}" /><w:spacing w:val="20" /><w:sz w:val="16" />')
    styles = set_ppr(styles, "Abstract", f'<w:pBdr><w:top w:val="single" w:sz="8" w:space="8" w:color="{INK}" /></w:pBdr><w:spacing w:before="0" w:after="120" />')
    styles = set_rpr(styles, "Abstract", f'{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="18" />')

    styles = set_ppr(styles, "Heading1", f'<w:keepNext /><w:keepLines /><w:pageBreakBefore /><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="{INK}" /></w:pBdr><w:spacing w:before="0" w:after="280" /><w:outlineLvl w:val="0" />')
    styles = set_rpr(styles, "Heading1", f'{FONTS}<w:b /><w:color w:val="{INK}" /><w:sz w:val="36" /><w:szCs w:val="36" />')
    styles = set_ppr(styles, "Heading2", '<w:keepNext /><w:keepLines /><w:spacing w:before="360" w:after="120" /><w:outlineLvl w:val="1" />')
    styles = set_rpr(styles, "Heading2", f'{FONTS}<w:b /><w:color w:val="{INK}" /><w:sz w:val="27" /><w:szCs w:val="27" />')
    styles = set_ppr(styles, "Heading3", '<w:keepNext /><w:keepLines /><w:spacing w:before="240" w:after="80" /><w:outlineLvl w:val="2" />')
    styles = set_rpr(styles, "Heading3", f'{FONTS}<w:b /><w:color w:val="1F1F1F" /><w:sz w:val="22" /><w:szCs w:val="22" />')
    for sid, size in (("Heading4", "20"), ("Heading5", "20"), ("Heading6", "20")):
        styles = set_rpr(styles, sid, f'{FONTS}<w:b /><w:color w:val="{MUTED}" /><w:sz w:val="{size}" />')

    styles = set_ppr(styles, "TOCHeading", '<w:keepNext /><w:pageBreakBefore /><w:spacing w:before="0" w:after="240" /><w:outlineLvl w:val="9" />')
    styles = set_rpr(styles, "TOCHeading", f'{FONTS}<w:b /><w:color w:val="{INK}" /><w:sz w:val="36" />')
    styles = set_rpr(styles, "Hyperlink", f'<w:color w:val="1F3A5F" /><w:u w:val="single" />')
    styles = set_rpr(styles, "VerbatimChar", '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas" /><w:color w:val="1F1F1F" /><w:sz w:val="18" /><w:shd w:val="clear" w:color="auto" w:fill="F3F3F3" />')
    styles = set_rpr(styles, "Caption", f'{FONTS}<w:i /><w:color w:val="{MUTED}" /><w:sz w:val="17" />')
    styles = set_ppr(styles, "ImageCaption", '<w:jc w:val="center" /><w:spacing w:before="40" w:after="240" />')
    styles = set_ppr(styles, "CaptionedFigure", '<w:keepNext /><w:jc w:val="center" /><w:spacing w:before="120" w:after="0" />')
    styles = set_ppr(styles, "BlockText", f'<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="{INK}" /></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F7F7F7" /><w:spacing w:before="120" w:after="120" /><w:ind w:left="240" w:right="240" />')

    # Tables: hairline grid, grey bold header row, 9pt text.
    a, b = style_block(styles, "Table")
    table = (
        '<w:style w:type="table" w:default="1" w:styleId="Table"><w:name w:val="Table" /><w:basedOn w:val="TableNormal" /><w:uiPriority w:val="59" /><w:qFormat />'
        f'<w:rPr><w:sz w:val="17" /><w:szCs w:val="17" /></w:rPr>'
        '<w:pPr><w:spacing w:before="20" w:after="20" w:line="260" w:lineRule="auto" /></w:pPr>'
        '<w:tblPr><w:tblInd w:w="0" w:type="dxa" />'
        f'<w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="{INK}" /><w:left w:val="nil" /><w:bottom w:val="single" w:sz="8" w:space="0" w:color="{INK}" /><w:right w:val="nil" />'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{RULE}" /><w:insideV w:val="single" w:sz="4" w:space="0" w:color="{RULE}" /></w:tblBorders>'
        '<w:tblCellMar><w:top w:w="50" w:type="dxa" /><w:left w:w="90" w:type="dxa" /><w:bottom w:w="50" w:type="dxa" /><w:right w:w="90" w:type="dxa" /></w:tblCellMar></w:tblPr>'
        '<w:tblStylePr w:type="firstRow"><w:rPr><w:b /><w:color w:val="0A0A0A" /></w:rPr>'
        '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="EFEFEF" /></w:tcPr></w:tblStylePr></w:style>'
    )
    styles = styles[:a] + table + styles[b:]
    # Contents entries (TOC 1 and TOC 2): dotted leader to a right-aligned page number.
    toc_styles = (
        '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1" /><w:basedOn w:val="Normal" /><w:next w:val="Normal" /><w:uiPriority w:val="39" /><w:unhideWhenUsed />'
        '<w:pPr><w:tabs><w:tab w:val="left" w:pos="560" /><w:tab w:val="right" w:leader="dot" w:pos="9638" /></w:tabs><w:spacing w:before="140" w:after="20" /></w:pPr>'
        f'<w:rPr>{FONTS}<w:b /><w:color w:val="{INK}" /><w:sz w:val="20" /></w:rPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2" /><w:basedOn w:val="Normal" /><w:next w:val="Normal" /><w:uiPriority w:val="39" /><w:unhideWhenUsed />'
        '<w:pPr><w:tabs><w:tab w:val="left" w:pos="1120" /><w:tab w:val="right" w:leader="dot" w:pos="9638" /></w:tabs><w:spacing w:before="0" w:after="0" /><w:ind w:left="560" /></w:pPr>'
        f'<w:rPr>{FONTS}<w:color w:val="333333" /><w:sz w:val="17" /></w:rPr></w:style>'
    )
    styles = styles.replace("</w:styles>", toc_styles + "</w:styles>")
    # Any remaining theme fonts and pandoc's default blues become Arial and ink.
    styles = re.sub(r'<w:rFonts w:asciiTheme="[^"]*" w:eastAsiaTheme="[^"]*" w:hAnsiTheme="[^"]*" w:cstheme="[^"]*" />', FONTS, styles)
    styles = re.sub(r'<w:color w:val="(4F81BD|345A8A|365F91|243F60|1F497D|17365D)"[^/]*/>', f'<w:color w:val="{INK}" />', styles)
    files["word/styles.xml"] = styles.encode("utf-8")

    # Header and footer parts, A4 page with comfortable margins.
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    run = lambda text, extra="": f'<w:r><w:rPr>{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="15" />{extra}</w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>'
    field = lambda code: (f'<w:r><w:rPr>{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="15" /></w:rPr><w:fldChar w:fldCharType="begin" /></w:r>'
                          f'<w:r><w:rPr>{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="15" /></w:rPr><w:instrText xml:space="preserve"> {code} </w:instrText></w:r>'
                          f'<w:r><w:rPr>{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="15" /></w:rPr><w:fldChar w:fldCharType="separate" /></w:r>'
                          f'<w:r><w:rPr>{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="15" /></w:rPr><w:t>1</w:t></w:r>'
                          f'<w:r><w:rPr>{FONTS}<w:color w:val="{MUTED}" /><w:sz w:val="15" /></w:rPr><w:fldChar w:fldCharType="end" /></w:r>')
    tabs = '<w:tabs><w:tab w:val="right" w:pos="9638" /></w:tabs>'
    header = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {W}><w:p><w:pPr>{tabs}'
              f'<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="{RULE}" /></w:pBdr></w:pPr>'
              f'{run("THE CAD PILLAR", "<w:b /><w:spacing w:val=\"20\" />")}{run("  ·  Master Technical Handbook")}<w:r><w:tab /></w:r>{run("Internal")}</w:p></w:hdr>')
    footer = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {W}><w:p><w:pPr>{tabs}'
              f'<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="{RULE}" /></w:pBdr></w:pPr>'
              f'{run("Ichizu Private Limited · Generated from docs/ (Markdown is the source of truth)")}<w:r><w:tab /></w:r>{run("Page ")}{field("PAGE")}{run(" of ")}{field("NUMPAGES")}</w:p></w:ftr>')
    files["word/header1.xml"] = header.encode("utf-8")
    files["word/footer1.xml"] = footer.encode("utf-8")

    rels = files["word/_rels/document.xml.rels"].decode("utf-8")
    rels = rels.replace("</Relationships>",
                        '<Relationship Id="rIdTcpHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
                        '<Relationship Id="rIdTcpFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>')
    files["word/_rels/document.xml.rels"] = rels.encode("utf-8")
    ct = files["[Content_Types].xml"].decode("utf-8")
    ct = ct.replace("</Types>",
                    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
                    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
    files["[Content_Types].xml"] = ct.encode("utf-8")

    doc = files["word/document.xml"].decode("utf-8")
    sect = ('<w:sectPr><w:headerReference w:type="default" r:id="rIdTcpHeader" /><w:footerReference w:type="default" r:id="rIdTcpFooter" />'
            '<w:pgSz w:w="11906" w:h="16838" /><w:pgMar w:top="1300" w:right="1134" w:bottom="1300" w:left="1134" w:header="560" w:footer="560" w:gutter="0" />'
            '<w:cols w:space="720" /><w:titlePg /></w:sectPr>')
    doc = re.sub(r"<w:sectPr\s*/>|<w:sectPr.*?</w:sectPr>", "", doc, flags=re.S)
    doc = doc.replace("</w:body>", sect + "</w:body>")
    files["word/document.xml"] = doc.encode("utf-8")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for name in ["[Content_Types].xml"] + sorted(n for n in files if n != "[Content_Types].xml"):
            z.writestr(name, files[name])
    print(f"wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
