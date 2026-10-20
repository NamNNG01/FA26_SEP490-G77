package com.examprep.services;

import com.examprep.exceptions.BadRequestException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

final class QuestionTextParser {
    private static final Pattern NUMBER=Pattern.compile("(?im)^\\s*(?:(?:Question|Câu)\\s*)?\\d+[.) :]\\s+");
    private static final Pattern OPTION=Pattern.compile("^([A-Ha-h])[.)]\\s+(.+)$");
    private static final Pattern ANSWER=Pattern.compile("(?iu)^(?:Answer|Correct answer|Đáp án)\\s*:\\s*([A-H])\\s*$");
    record Parsed(String content,String type,List<String> options,int correctIndex) {}

    static List<Parsed> parse(String text) {
        if(text==null || text.isBlank()) throw new BadRequestException("No readable questions found.");
        var matcher=NUMBER.matcher(text); List<Integer> starts=new ArrayList<>(),ends=new ArrayList<>();
        while(matcher.find()) { starts.add(matcher.start()); ends.add(matcher.end()); }
        if(starts.isEmpty() || starts.size()>500) throw new BadRequestException("Import needs 1-500 numbered questions (for example: 1. Explain indexing.).");
        List<Parsed> result=new ArrayList<>();
        for(int n=0;n<starts.size();n++) {
            String block=text.substring(ends.get(n),n+1<starts.size()?starts.get(n+1):text.length()).strip();
            StringBuilder content=new StringBuilder(); List<String> options=new ArrayList<>(); List<Character> letters=new ArrayList<>(); Character answer=null;
            for(String line:block.split("\\R")) {
                line=line.strip(); if(line.isEmpty()) continue;
                var option=OPTION.matcher(line); var correct=ANSWER.matcher(line);
                if(correct.matches()) { if(answer!=null) throw new BadRequestException("Multiple answer keys in one question."); answer=Character.toUpperCase(correct.group(1).charAt(0)); }
                else if(option.matches()) { char letter=Character.toUpperCase(option.group(1).charAt(0)); if(letters.contains(letter)) throw new BadRequestException("Duplicate option label."); letters.add(letter); options.add(option.group(2)); }
                else if(!options.isEmpty()) {
                    int last=options.size()-1; options.set(last,options.get(last)+" "+line);
                } else { if(!content.isEmpty()) content.append('\n'); content.append(line); }
            }
            if(content.isEmpty()) throw new BadRequestException("Question content is missing.");
            if(!options.isEmpty() && (options.size()<2 || answer==null || !letters.contains(answer))) throw new BadRequestException("Choice questions need at least two options and an Answer: letter key.");
            if(options.isEmpty() && answer!=null) throw new BadRequestException("Answer key has no options.");
            result.add(new Parsed(content.toString(),options.isEmpty()?"ESSAY":"SINGLE_CHOICE",List.copyOf(options),answer==null?-1:letters.indexOf(answer)));
        }
        return result;
    }
    static String hash(String text) {
        String normalized=Normalizer.normalize(text,Normalizer.Form.NFKC).strip().toLowerCase(Locale.ROOT).replaceAll("(?U)\\s+"," ");
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
