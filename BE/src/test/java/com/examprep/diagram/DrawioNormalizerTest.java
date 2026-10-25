package com.examprep.diagram;

import com.examprep.util.diagram.DrawioNormalizer;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.Deflater;

import static org.junit.jupiter.api.Assertions.*;

class DrawioNormalizerTest {
    private static final String MODEL = """
            <mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
            <mxCell id="p" value="Shop" style="swimlane;" vertex="1" parent="1"><mxGeometry x="0" y="0" as="geometry"/></mxCell>
            <UserObject id="a" label="Customer&lt;br&gt;(actor)"><mxCell style="shape=umlActor;fillColor=#fff;" vertex="1" parent="p"><mxGeometry as="geometry"/></mxCell></UserObject>
            <mxCell id="b" value="Order" style="rounded=1;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>
            <mxCell id="e" style="endArrow=block;endFill=0;strokeColor=#000;" edge="1" parent="1" source="a" target="b"><mxGeometry as="geometry"/></mxCell>
            <mxCell id="l" value="places" style="edgeLabel;" vertex="1" connectable="0" parent="e"><mxGeometry as="geometry"/></mxCell>
            </root></mxGraphModel>""";

    @Test void keepsLabelsShapesContainersAndRelationsButNotGeometryOrColours() {
        DrawioNormalizer.Result result = DrawioNormalizer.normalize("<mxfile><diagram id=\"x\">" + MODEL + "</diagram></mxfile>");
        assertEquals(4, result.elements()); // 3 shapes + 1 connection; the edge label is part of the connection
        String text = result.text();
        assertTrue(text.contains("- Customer (actor) [umlActor] inside Shop"), text);
        assertTrue(text.contains("- Customer (actor) -> Order : places (endArrow=block, endFill=0)"), text);
        assertFalse(text.contains("#fff") || text.contains("geometry") || text.contains("strokeColor"), text);
    }

    @Test void readsCompressedDiagrams() throws Exception {
        Deflater deflater = new Deflater(Deflater.DEFAULT_COMPRESSION, true);
        deflater.setInput(URLEncoder.encode(MODEL, StandardCharsets.UTF_8).replace("+", "%20").getBytes(StandardCharsets.UTF_8));
        deflater.finish();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        while (!deflater.finished()) out.write(buffer, 0, deflater.deflate(buffer));
        String compressed = Base64.getEncoder().encodeToString(out.toByteArray());
        DrawioNormalizer.Result result = DrawioNormalizer.normalize("<mxfile><diagram id=\"x\">" + compressed + "</diagram></mxfile>");
        assertTrue(result.text().contains("Order"));
        assertEquals(4, result.elements());
    }

    @Test void rejectsDoctypeAndGarbage() {
        assertThrows(IllegalArgumentException.class, () -> DrawioNormalizer.normalize(
                "<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><mxGraphModel><root>&e;</root></mxGraphModel>"));
        assertThrows(IllegalArgumentException.class, () -> DrawioNormalizer.normalize("not xml"));
        assertThrows(IllegalArgumentException.class, () -> DrawioNormalizer.normalize("<mxfile></mxfile>"));
    }
}
