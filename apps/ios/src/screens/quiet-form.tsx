import {useState,type ReactNode} from 'react';
import {Pressable,StyleSheet,View,type TextInputProps} from 'react-native';
import {Text,TextInput,type} from './life-text';
import {clay,hairline,ink,inkSoft,paper,placeholder,sage} from './life-page';

/** A writing space on the page, with a persistent label and a visible focus edge. */
export function QuietField({label,hint,style,onFocus,onBlur,...props}:TextInputProps&{label:string;hint?:string}) {
  const [focused,setFocused]=useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput {...props} accessibilityLabel={props.accessibilityLabel??label} accessibilityHint={props.accessibilityHint??hint}
      placeholderTextColor={placeholder} selectionColor={sage}
      onFocus={event=>{setFocused(true);onFocus?.(event);}} onBlur={event=>{setFocused(false);onBlur?.(event);}}
      style={[styles.input,props.multiline&&styles.multiline,focused&&styles.focused,props.editable===false&&styles.readOnly,style]}/>
    {hint?<Text style={styles.hint}>{hint}</Text>:null}
  </View>;
}
export function PageAction({label,onPress,disabled=false,testID,tone='quiet'}:{label:string;onPress:()=>void;disabled?:boolean;testID?:string;tone?:'primary'|'quiet'|'destructive'}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} testID={testID} disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.action,tone==='primary'&&styles.primary,disabled&&styles.disabled,pressed&&!disabled&&styles.pressed]}>
    <Text style={[styles.actionLabel,tone==='primary'&&styles.primaryLabel,tone==='destructive'&&styles.destructiveLabel]}>{label}</Text>
  </Pressable>;
}
export function FormSection({children}: {children:ReactNode}) {return <View style={styles.section}>{children}</View>;}
const styles=StyleSheet.create({
  section:{gap:12,paddingVertical:20,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:hairline},
  field:{gap:8,width:'100%'},label:{...type.meta,color:inkSoft},
  input:{...type.action,minHeight:54,color:ink,paddingHorizontal:14,paddingVertical:14,backgroundColor:'rgba(255,255,255,0.36)',borderBottomWidth:1,borderBottomColor:hairline,borderRadius:4},
  focused:{borderBottomColor:sage,borderBottomWidth:2,backgroundColor:'rgba(255,255,255,0.62)'},
  readOnly:{opacity:0.65},multiline:{minHeight:116,textAlignVertical:'top'},
  hint:{...type.meta,fontSize:13,lineHeight:21,color:inkSoft},
  action:{minHeight:48,paddingHorizontal:4,paddingVertical:12,alignSelf:'stretch',justifyContent:'center'},
  primary:{minHeight:54,backgroundColor:sage,borderRadius:6,paddingHorizontal:20,alignItems:'center'},
  actionLabel:{...type.action,color:sage,flexShrink:1},primaryLabel:{color:paper,textAlign:'center'},destructiveLabel:{color:clay},
  disabled:{opacity:0.45},pressed:{opacity:0.78},
});
