"""Generación del PDF de un acta de asistencia.

Renderiza el acta a partir del documento CONGELADO de `asistencia_actas`
(nunca desde `asistencias`), así que el PDF es prueba de lo que se tomó en
su momento y no cambia aunque después se corrija la asistencia.

Cada descarga genera un PDF nuevo con la fecha/hora de impresión, para que
sirva también como constancia de cuándo se consultó.
"""
from datetime import datetime
from io import BytesIO
from urllib.parse import quote

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_ESTADOS = {
    "Presente": colors.HexColor("#15803d"),
    "Ausente": colors.HexColor("#b91c1c"),
    "Tarde": colors.HexColor("#b45309"),
}

_ETIQUETA_TIPO = {
    "institucional": "ACTA DE ASISTENCIA INSTITUCIONAL",
    "materia": "ACTA DE ASISTENCIA POR MATERIA",
}


def nombre_archivo(acta):
    """Nombre de archivo legible, sin caracteres problemáticos."""
    partes = ["acta", str(acta.get("curso") or ""), str(acta.get("fecha") or "")]
    if acta.get("tipo") == "institucional":
        partes.append(str(acta.get("turno") or ""))
    else:
        partes.append(str(acta.get("materia") or ""))
    partes.append(f"v{int(acta.get('version') or 1)}")
    return "_".join(p for p in partes if p) + ".pdf"


def content_disposition(nombre):
    """Attachment compatible con nombres no-ASCII (RFC 6266 / 5987)."""
    ascii_nombre = "".join(c if c.isascii() and (c.isalnum() or c in "._-") else "_"
                           for c in nombre)
    return (
        f'attachment; filename="{ascii_nombre}"; '
        f"filename*=UTF-8''{quote(nombre)}"
    )


def _estilos():
    base = getSampleStyleSheet()
    return {
        "escuela": ParagraphStyle("escuela", parent=base["Normal"], fontName="Helvetica-Bold",
                                  fontSize=13, alignment=TA_CENTER, spaceAfter=1),
        "titulo": ParagraphStyle("titulo", parent=base["Normal"], fontName="Helvetica-Bold",
                                 fontSize=12, alignment=TA_CENTER, spaceAfter=8,
                                 textColor=colors.HexColor("#1f2937")),
        "celda": ParagraphStyle("celda", parent=base["Normal"], fontSize=7.5, leading=9.5),
        "celda_centro": ParagraphStyle("celda_centro", parent=base["Normal"], fontSize=7.5,
                                       leading=9.5, alignment=TA_CENTER),
        "celda_estado": ParagraphStyle("celda_estado", parent=base["Normal"], fontSize=7.5,
                                       leading=9.5, alignment=TA_CENTER,
                                       textColor=colors.black),
        "dato": ParagraphStyle("dato", parent=base["Normal"], fontSize=8.5),
        "dato_valor": ParagraphStyle("dato_valor", parent=base["Normal"], fontSize=9.5,
                                     fontName="Helvetica-Bold"),
        "pie": ParagraphStyle("pie", parent=base["Normal"], fontSize=7,
                              textColor=colors.HexColor("#6b7280"), leading=9),
        "obs": ParagraphStyle("obs", parent=base["Normal"], fontSize=7, leading=9,
                              textColor=colors.HexColor("#374151")),
    }


def _datos_encabezado(acta, e):
    """Tabla de dos filas con los datos de contexto del acta."""
    total = (acta.get("resumen") or {}).get("total", 0)
    if acta.get("tipo") == "institucional":
        fila2 = ("Turno", acta.get("turno") or "-")
    else:
        fila2 = ("Materia", acta.get("materia") or "-")
    grupos = [
        ("Curso", acta.get("curso") or "-"),
        ("Fecha", acta.get("fecha") or "-"),
        ("Año lectivo", acta.get("anio_lectivo") or "-"),
        fila2,
        ("Alumnos del curso", total),
    ]

    celdas = []
    for etiqueta, valor in grupos:
        celdas.append(Paragraph(f"<b>{etiqueta}</b>", e["dato"]))
        celdas.append(Paragraph(str(valor), e["dato_valor"]))

    t = Table([celdas[:4], celdas[4:] + ["", ""]],
              colWidths=[2.6 * cm, 2.9 * cm, 2.3 * cm, 2.6 * cm, 2.6 * cm, 2.0 * cm, 2.0 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _tabla_registros(acta, e):
    """Tabla principal con un renglón por alumno del curso."""
    encabezado = ["N°", "N° Inscripto", "Apellido y Nombre", "Estado", "Hora", "Min.", "Observaciones"]
    datos = [encabezado]
    for i, reg in enumerate(acta.get("registros") or [], start=1):
        numero = reg.get("numero")
        estado = reg.get("estado")
        celda_estado = Paragraph(
            f'<font color="{_ESTADOS[estado].hexval()}"><b>{estado}</b></font>'
            if estado in _ESTADOS else '<font color="#9ca3af">Sin marcar</font>',
            e["celda_estado"],
        )
        minutos = reg.get("minutosRetraso")
        datos.append([
            Paragraph(str(i), e["celda_centro"]),
            Paragraph(str(numero) if numero is not None else "-", e["celda_centro"]),
            Paragraph(f"{reg.get('apellido', '')}, {reg.get('nombres', '')}".strip(" ,"),
                      e["celda"]),
            celda_estado,
            Paragraph(str(reg.get("horaIngreso") or ""), e["celda_centro"]),
            Paragraph(str(minutos) if minutos not in (None, "") else "", e["celda_centro"]),
            Paragraph(str(reg.get("observacion") or ""), e["celda"]),
        ])

    t = Table(datos, colWidths=[0.9 * cm, 1.6 * cm, 6.1 * cm, 2.0 * cm, 1.6 * cm, 1.2 * cm, 3.6 * cm],
              repeatRows=1)
    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(datos)):
        if i % 2 == 0:
            estilo.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f9fafb")))
    t.setStyle(TableStyle(estilo))
    return t


def _resumen_linea(acta, e):
    """Franja con los conteos de la clase."""
    r = acta.get("resumen") or {}
    partes = [
        f"Alumnos: <b>{r.get('total', 0)}</b>",
        f"Presentes: <b>{r.get('presentes', 0)}</b>",
        f"Ausentes: <b>{r.get('ausentes', 0)}</b>",
        f"Tardes: <b>{r.get('tardes', 0)}</b>",
        f"Sin marcar: <b>{r.get('sinMarcar', 0)}</b>",
    ]
    t = Table([[Paragraph(" · ".join(partes), e["dato"])]], colWidths=[17 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f4f6")),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _firmas(e):
    """Espacio para firma y observaciones al pie del acta."""
    linea = Table(
        [["", ""], ["Firma del docente / preceptor", "Aclaración y sello"]],
        colWidths=[8.5 * cm, 8.5 * cm],
        rowHeights=[1.5 * cm, 0.5 * cm],
    )
    linea.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, colors.HexColor("#6b7280")),
        ("LINEABOVE", (1, 0), (1, 0), 0.6, colors.HexColor("#6b7280")),
        ("FONTSIZE", (0, 1), (-1, 1), 7),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#6b7280")),
        ("ALIGN", (0, 1), (-1, 1), "CENTER"),
    ]))
    return linea


def generar_acta_pdf(acta):
    """Devuelve los bytes del PDF del acta."""
    e = _estilos()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.8 * cm,
        title=f"Acta de asistencia {acta.get('curso', '')} {acta.get('fecha', '')}".strip(),
        author=acta.get("generadoPor", "") or "Cuaderno Digital",
    )

    titulo = _ETIQUETA_TIPO.get(acta.get("tipo"), "ACTA DE ASISTENCIA")
    story = [
        Paragraph(acta.get("escuela") or "Cuaderno Digital", e["escuela"]),
        Paragraph(titulo, e["titulo"]),
        _datos_encabezado(acta, e),
        Spacer(1, 8),
        _resumen_linea(acta, e),
        Spacer(1, 8),
        _tabla_registros(acta, e),
    ]

    observaciones = [
        rev for rev in (acta.get("revisiones") or [])
    ]
    story.append(Spacer(1, 14))
    story.append(KeepTogether(_firmas(e)))

    def _pie(canvas, docu):
        canvas.saveState()
        # Consultas de revisión: deja rastro de que el acta fue modificada.
        lineas = [
            f"Acta generada por {acta.get('generadoPor', 's/d')} "
            f"({acta.get('generadoPorRol', '')}) el {_fecha(acta.get('creado'))}.",
            f"Última actualización: {_fecha(acta.get('actualizado'))} · "
            f"Revisión {int(acta.get('version') or 1)} de este documento."
            f" Copia impresa el {_fecha(datetime.now().isoformat())}.",
        ]
        if len(observaciones) > 1:
            lineas.append(
                f"Esta acta fue modificada {len(observaciones)} veces; "
                "el detalle de cambios no altera los estados que figuran en la tabla."
            )
        y = 1.35 * cm
        for linea in lineas:
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(colors.HexColor("#6b7280"))
            canvas.drawString(2 * cm, y, linea)
            y -= 0.42 * cm
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(A4[0] - 2 * cm, 0.8 * cm, f"Página {docu.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_pie, onLaterPages=_pie)
    return buffer.getvalue()


def _fecha(iso):
    """ISO -> 'dd/mm/aaaa hh:mm' para el pie del PDF."""
    if not iso:
        return "s/d"
    try:
        dt = datetime.fromisoformat(str(iso))
    except (TypeError, ValueError):
        return str(iso)
    return dt.strftime("%d/%m/%Y %H:%M")
